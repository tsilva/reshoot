import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Pool } from "@neondatabase/serverless";
import { createRealtimeClient, type LiveQuerySnapshot } from "@neon/realtime/client";
import { createRealtime } from "@neon/realtime/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { batchRealtimeQuery } from "../lib/generation/realtime";
import type { BatchRealtimeRow } from "../lib/generation/realtime-types";

// Run only against an explicitly disposable branch, migrated by the caller.
// Never use the application's DATABASE_URL or invoke generation/credit services.
const connection = process.env.RESHOOT_REALTIME_TEST_DATABASE_URL;
it.skipIf(!connection)("streams committed batch changes and enforces owner scope", async () => {
  if (process.env.RESHOOT_REALTIME_TEST_DISPOSABLE !== "yes") throw new Error("An explicitly disposable branch is required.");
  const secret = process.env.RESHOOT_REALTIME_TEST_SECRET;
  const url = process.env.RESHOOT_REALTIME_TEST_URL;
  if (!secret || !url) throw new Error("Disposable branch Realtime configuration is required.");
  const pool = new Pool({ connectionString: connection });
  const socketBefore = globalThis.WebSocket;
  // Node's native WebSocket can retain handles after close; use the SDK's
  // optional Node transport so this contract test also verifies clean teardown.
  globalThis.WebSocket = createRequire(import.meta.resolve("@neon/realtime"))("ws").WebSocket;
  const client = createRealtimeClient({ url });
  const owner = randomUUID(), other = randomUUID(), project = randomUUID();
  const price = randomUUID(), quote = randomUUID(), batch = randomUUID(), shot = randomUUID(), job = randomUUID();
  const realtime = createRealtime({ secret, db: decodeURIComponent(new URL(connection!).pathname.slice(1)) });
  const snapshots: LiveQuerySnapshot<BatchRealtimeRow>[] = [];
  let notify = () => {};
  const waitFor = async (predicate: () => boolean) => {
    if (predicate()) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Realtime contract timed out.")), 30_000);
      notify = () => {
        const error = snapshots.find((snapshot) => snapshot.status === "error");
        if (error) { clearTimeout(timer); reject(new Error("Realtime subscription rejected.")); }
        else if (predicate()) { clearTimeout(timer); resolve(); }
      };
      notify();
    });
  };
  const revision = () => snapshots.at(-1)?.data?.[0]?.revision;
  try {
    await pool.query("INSERT INTO users (id,email,display_name) VALUES ($1,$2,'Realtime fixture'),($3,$4,'Other fixture')", [owner, `${owner}@example.invalid`, other, `${other}@example.invalid`]);
    await pool.query("INSERT INTO projects (id,owner_id,title) VALUES ($1,$2,'Realtime contract')", [project, owner]);
    await pool.query("INSERT INTO price_versions (id,label,output_cost_micros,text_allowance_micros,reference_allowance_micros,provider_funding_bps,failure_reserve_bps,gross_margin_bps) VALUES ($1,$2,1,1,1,0,0,0)", [price, price]);
    await pool.query("INSERT INTO generation_quotes (id,owner_id,project_id,price_version_id,shots,total_credits,expires_at) VALUES ($1,$2,$3,$4,'[]',1,now()+interval '1 hour')", [quote, owner, project, price]);
    await pool.query("INSERT INTO generation_batches (id,owner_id,project_id,quote_id,idempotency_key,total_credits) VALUES ($1,$2,$3,$4,$5,1)", [batch, owner, project, quote, batch]);
    await pool.query("INSERT INTO shots (id,owner_id,project_id,label) VALUES ($1,$2,$3,'Front')", [shot, owner, project]);
    await pool.query("INSERT INTO generation_jobs (id,owner_id,batch_id,shot_id,version,reference_count,quoted_credits) VALUES ($1,$2,$3,$4,1,1,1)", [job, owner, batch, shot]);
    const sub = client.subscribe(await realtime.seal({ query: batchRealtimeQuery(owner, batch) }));
    sub.onChange((snapshot) => { if (snapshot.status === "live" || snapshot.status === "error") snapshots.push(snapshot); notify(); });
    await waitFor(() => revision() !== undefined);
    let current = revision()!;

    const foreign = client.subscribe(await realtime.seal({ query: batchRealtimeQuery(other, batch) }));
    let foreignData: readonly BatchRealtimeRow[] | undefined;
    foreign.onChange((snapshot) => { if (snapshot.status === "live") foreignData = snapshot.data; notify(); });
    await waitFor(() => foreignData !== undefined);
    expect(foreignData).toEqual([]);

    await pool.query("UPDATE generation_jobs SET status='running' WHERE id=$1", [job]);
    await waitFor(() => revision() !== current);
    current = revision()!;
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      await tx.query("UPDATE generation_jobs SET public_error='Rolled back' WHERE id=$1", [job]);
      const pending = await tx.query("SELECT revision FROM generation_batch_revisions WHERE batch_id=$1", [batch]);
      expect(BigInt(pending.rows[0].revision)).toBe(BigInt(current) + BigInt(1));
      await tx.query("ROLLBACK");
    } finally { tx.release(); }
    const afterRollback = await pool.query("SELECT revision FROM generation_batch_revisions WHERE batch_id=$1", [batch]);
    expect(String(afterRollback.rows[0].revision)).toBe(current);

    await pool.query("INSERT INTO generation_outputs (owner_id,project_id,job_id,shot_id,version,r2_key,preview_r2_key,mime_type,size_bytes,checksum_sha256,width,height) VALUES ($1,$2,$3,$4,1,$5,$6,'image/png',1,'fixture',1,1)", [owner, project, job, shot, `${job}/fixture`, `${job}/preview`]);
    await waitFor(() => revision() !== current);
    current = revision()!;
    await pool.query("UPDATE generation_batches SET status='succeeded',completed_jobs=1 WHERE id=$1", [batch]);
    await waitFor(() => revision() !== current);
    expect(foreignData).toEqual([]);
    expect(Object.keys(snapshots.at(-1)!.data![0])).toEqual(["revision"]);
    const raw = batchRealtimeQuery(owner, batch);
    expect(raw.sql).not.toContain(owner);
    expect(raw.sql).not.toMatch(/r2_key|prompt|credit|provider/);
  } finally {
    client.close();
    await pool.end();
    globalThis.WebSocket = socketBefore;
    // The runner deletes the disposable branch, including fixtures, even on failure.
  }
}, 90_000);
