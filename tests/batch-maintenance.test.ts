import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]>, dispatch: vi.fn(), release: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/generation/batches", () => ({ dispatchBatchOutbox: state.dispatch }));
vi.mock("@/lib/generation/accounting", () => ({ releaseGeneration: state.release }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: (table: Table) => {
  const rows = () => Promise.resolve(state.rows[getTableName(table)] ?? []);
  const query = { where: () => ({ then: (resolve: (value: unknown[]) => void) => rows().then(resolve), limit: rows }) };
  return { ...query, innerJoin: () => query };
} }) } }));
import { maintainGenerationBatch } from "../workflows/generation/batch-steps";

describe("generation maintenance without browser polling", () => {
  beforeEach(() => { vi.resetAllMocks(); state.rows = {}; });
  it.each(["succeeded", "partial", "failed"])("does no work for %s batches", async (status) => {
    state.rows.generation_batches = [{ status }];
    expect(await maintainGenerationBatch("batch", "owner")).toBeNull();
    expect(state.dispatch).not.toHaveBeenCalled();
    expect(state.release).not.toHaveBeenCalled();
  });
  it("does no work for missing or foreign batches", async () => {
    expect(await maintainGenerationBatch("missing", "owner")).toBeNull();
    expect(state.dispatch).not.toHaveBeenCalled();
  });
  it("retries the outbox and sleeps until its next dispatch deadline", async () => {
    const retryAt = new Date(Date.now() + 10_000);
    state.rows = {
      generation_batches: [{ status: "held" }],
      generation_jobs: [],
      workflow_outbox: [{ nextAttemptAt: retryAt, leaseExpiresAt: null }],
    };
    // The first jobs read is the stale-attempt join; the second is active jobs.
    state.dispatch.mockImplementation(() => {
      let reads = 0;
      Object.defineProperty(state.rows, "generation_jobs", { configurable: true, get: () => ++reads === 1 ? [] : [{ leaseExpiresAt: null }] });
    });
    expect((await maintainGenerationBatch("batch", "owner"))?.getTime()).toBe(retryAt.getTime() + 100);
    expect(state.dispatch).toHaveBeenCalledWith("batch", "owner");
    expect(state.release).not.toHaveBeenCalled();
  });
  it("settles a stalled provider call without another paid call", async () => {
    state.rows.generation_batches = [{ status: "running" }];
    let reads = 0;
    Object.defineProperty(state.rows, "generation_jobs", { configurable: true, get: () => ++reads === 1
      ? [{ job: { id: "job" }, attempt: { id: "attempt", state: "started" } }] : [] });
    expect(await maintainGenerationBatch("batch", "owner")).toBeNull();
    expect(state.release).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job", attemptId: "attempt", attemptState: "ambiguous" }));
  });
});
