import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuoteShotInput } from "../lib/db/schema";
import { previousSequenceShots, reviewContextShots, sequenceContextShots } from "../lib/generation/sequence";

const state = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { transaction: state.transaction } }));
vi.mock("workflow", () => ({ RetryableError: Error }));
vi.mock("@/lib/storage/r2", () => ({ getObjectBuffer: vi.fn(), headObject: vi.fn(), putObject: vi.fn(), sha256Hex: vi.fn() }));
vi.mock("@/lib/generation/provider", () => ({ imageProviderConfig: { model: "pinned", endpoint: "https://provider.invalid/images" } }));
// Keep the real claim implementation for the database gate tests below.
import { claimGenerationJob } from "../workflows/generation/steps";

const frozen = (ids = ["front", "right", "rear"]): QuoteShotInput[] => ids.map((shotId, index) => ({
  clientId: `view-${index}`, shotId, label: "View", azimuth: index * 90, referenceAssetIds: ["original"],
  sequencePolicy: "previous-views-v1", rotationPolicy: "verified-rotation-v1",
}));

function database(quoteShots = frozen()) {
  const jobs = ["front", "right", "rear"].map((shotId) => ({ id: `job-${shotId}`, shotId, batchId: "batch", ownerId: "owner",
    status: "queued", leaseExpiresAt: null as Date | null }));
  const attempts: Array<Record<string, unknown>> = [];
  const conditions: Array<{ table: string; sql: string; params: unknown[] }> = [];
  const dialect = new PgDialect();
  const select = (selection?: Record<string, unknown>) => ({ from: (table: Table) => {
    const name = getTableName(table);
    let condition: SQL;
    const read = async () => {
      const parsed = dialect.sqlToQuery(condition);
      conditions.push({ table: name, ...parsed });
      if (name === "generation_batches") return [{ shots: quoteShots }];
      if (name === "generation_attempts") return attempts.filter((row) => row.jobId === parsed.params[0]);
      if (selection && "value" in selection) return [{ value: 0 }];
      if (selection && "shotId" in selection) {
        const [batchId, ownerId, ...ids] = parsed.params;
        return jobs.filter((job) => job.batchId === batchId && job.ownerId === ownerId && ids.includes(job.shotId));
      }
      return jobs.filter((job) => job.id === parsed.params[0]);
    };
    const query = { innerJoin: () => query, where: (value: SQL) => { condition = value; return query; },
      limit: read, orderBy: () => query, then: (resolve: (rows: unknown[]) => void) => read().then(resolve) };
    return query;
  } });
  const update = (table: Table) => ({ set: (patch: Record<string, unknown>) => ({ where: async (condition: SQL) => {
    if (getTableName(table) === "generation_jobs") {
      const id = dialect.sqlToQuery(condition).params[0];
      Object.assign(jobs.find((job) => job.id === id)!, patch);
    }
  } }) });
  state.transaction.mockImplementation(async (callback) => callback({ execute: async () => {}, select, update,
    insert: () => ({ values: async (value: Record<string, unknown>) => { attempts.push(value); } }),
  }));
  return { jobs, attempts, conditions };
}

describe("durable sequential rotation claims", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does not lease a later job or create an attempt while its predecessor is queued or running", async () => {
    const { jobs, attempts } = database();
    expect(await claimGenerationJob("job-rear")).toEqual({ kind: "waiting" });
    expect(attempts).toHaveLength(0);
    expect(await claimGenerationJob("job-front")).toMatchObject({ kind: "execute" });
    expect(await claimGenerationJob("job-right")).toEqual({ kind: "waiting" });
    expect(attempts).toHaveLength(1);
    expect(jobs[1].status).toBe("queued");
    jobs[0].status = "succeeded";
    expect(await claimGenerationJob("job-right")).toMatchObject({ kind: "execute" });
    expect(await claimGenerationJob("job-rear")).toEqual({ kind: "waiting" });
    jobs[1].status = "succeeded";
    expect(await claimGenerationJob("job-rear")).toMatchObject({ kind: "execute" });
    expect(attempts).toHaveLength(3);
  });

  it("continues after a rejected predecessor and scopes its dependency reads to this owner and batch", async () => {
    const { jobs, conditions } = database();
    jobs[0].status = "failed";
    expect(await claimGenerationJob("job-right")).toMatchObject({ kind: "execute" });
    expect(conditions).toContainEqual(expect.objectContaining({ table: "generation_jobs",
      params: ["batch", "owner", "front"], sql: expect.stringContaining('"generation_jobs"."shot_id" in'),
    }));
  });

  it("waits on an expired running predecessor until recovery or maintenance settles it", async () => {
    const { jobs, attempts } = database();
    jobs[0].status = "running";
    jobs[0].leaseExpiresAt = new Date(0);
    expect(await claimGenerationJob("job-right")).toEqual({ kind: "waiting" });
    expect(attempts).toHaveLength(0);
  });

  it("preserves legacy parallel claims and duplicate-run protection", async () => {
    const { attempts } = database(frozen().map((shot) => ({ ...shot, sequencePolicy: undefined })));
    expect(await claimGenerationJob("job-rear")).toMatchObject({ kind: "execute" });
    expect(await claimGenerationJob("job-rear")).toEqual({ kind: "duplicate" });
    expect(attempts).toHaveLength(1);
  });

  it("fails closed on a missing predecessor job instead of dispatching without its context", async () => {
    const { jobs, attempts } = database();
    jobs.shift();
    await expect(claimGenerationJob("job-right")).rejects.toThrow("sequence jobs are missing");
    expect(attempts).toHaveLength(0);
  });

  it("uses frozen quote order rather than angle sorting or dispatch timestamps", () => {
    expect(previousSequenceShots(frozen(["rear", "front", "right"]), "front")?.map((shot) => shot.shotId)).toEqual(["rear"]);
    expect(previousSequenceShots(frozen(), "front")).toEqual([]);
    expect(previousSequenceShots([], "legacy")).toBeUndefined();
  });

  it("rejects an unbound, duplicated, partially versioned or unknown sequence", () => {
    const shots = frozen();
    for (const invalid of [
      shots.map((shot) => ({ ...shot, shotId: undefined })),
      frozen(["front", "front", "rear"]),
      shots.map((shot, index) => index ? shot : { ...shot, sequencePolicy: undefined }),
    ]) expect(() => previousSequenceShots(invalid, "right")).toThrow("sequence is invalid");
    expect(() => previousSequenceShots(shots, "foreign-shot")).toThrow("sequence is invalid");
  });
});

describe("cardinal anchors before diagonals", () => {
  const shots: QuoteShotInput[] = [0, 45, 90, 135, 180, 225, 270, 315].map((azimuth) => ({
    clientId: String(azimuth), shotId: String(azimuth), label: "View", azimuth,
    referenceAssetIds: ["original"], sequencePolicy: "cardinal-anchors-v2", rotationPolicy: "verified-rotation-v2",
  }));

  it("waits for front, back, right and left before generating any diagonal, independent of quote order", () => {
    expect(previousSequenceShots(shots, "0")).toEqual([]);
    expect(previousSequenceShots(shots, "180")?.map(s => s.azimuth)).toEqual([0]);
    expect(previousSequenceShots(shots, "90")?.map(s => s.azimuth)).toEqual([0, 180]);
    expect(previousSequenceShots(shots, "270")?.map(s => s.azimuth)).toEqual([0, 180, 90]);
    expect(previousSequenceShots(shots, "45")?.map(s => s.azimuth)).toEqual([0, 180, 90, 270]);
  });

  it("uses only neighboring cardinal anchors for each diagonal, including the wrap", () => {
    for (const [angle, pair] of [[45, [0, 90]], [135, [90, 180]], [225, [180, 270]], [315, [270, 0]]] as const) {
      expect(sequenceContextShots(shots, String(angle))?.map(s => s.azimuth)).toEqual(pair);
    }
    expect(reviewContextShots(shots, "225")?.map(s => s.azimuth)).toEqual([0, 180, 90, 270, 135]);
    expect(reviewContextShots(shots, "315")?.map(s => s.azimuth)).toEqual([0, 180, 90, 270, 45]);
  });

  it("never dispatches a diagonal while a cardinal is unfinished", async () => {
    const { jobs, attempts } = database(shots);
    jobs.splice(0, jobs.length, ...shots.map(s=>({id:`job-${s.shotId}`,shotId:s.shotId!,batchId:"batch",ownerId:"owner",status:"queued",leaseExpiresAt:null})));
    expect(await claimGenerationJob("job-45")).toEqual({kind:"waiting"});
    expect(attempts).toHaveLength(0);
    for(const job of jobs) if(["0","180","90","270"].includes(job.shotId))job.status="succeeded";
    expect(await claimGenerationJob("job-45")).toMatchObject({kind:"execute"});
  });
});
