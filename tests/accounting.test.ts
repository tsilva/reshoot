import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { transaction: transactionMock } }));

import { captureGeneration, releaseGeneration } from "../lib/generation/accounting";

type Row = { id: string; [key: string]: unknown };
const batchId = "00000000-0000-4000-8000-000000000100";
const userId = "00000000-0000-4000-8000-000000000200";
const jobIds = [1, 2, 3].map((value) => `00000000-0000-4000-8000-00000000000${value}`);

// A READ COMMITTED database double: unlocked selects return snapshots, and row
// locks serialize transactions until commit. This reproduces the original lost
// update without provider calls, credentials, or changes to a live database.
function settlementDatabase() {
  const tables: Record<string, Row[]> = {
    generation_jobs: jobIds.map((id) => ({ id, ownerId: userId, batchId, quotedCredits: 40, status: "running" })),
    generation_attempts: jobIds.map((id) => ({ id: `attempt-${id}`, jobId: id, state: "started" })),
    generation_outputs: [],
    generation_batches: [{ id: batchId, projectId: "project", ownerId: userId }],
    projects: [{ id: "project", ownerId: userId, status: "generating" }],
    credit_accounts: [{ id: "account", availableCredits: 880, heldCredits: 120 }],
    credit_holds: [{ id: "hold", accountId: "account", batchId, originalCredits: 120, remainingCredits: 120, capturedCredits: 0, releasedCredits: 0 }],
    credit_ledger: [],
  };
  const locks = new Map<string, Promise<void>>();
  const dialect = new PgDialect();

  function matching(table: string, condition: SQL) {
    const { sql, params } = dialect.sqlToQuery(condition);
    return tables[table].filter((row) => {
      // Conditions here are equality filters in the real settlement functions.
      const columns = [...sql.matchAll(/"\w+"\."(\w+)" = \$\d+/g)].map((match) =>
        match[1].replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      );
      return columns.every((column, index) => row[column] === params[index]);
    });
  }

  transactionMock.mockImplementation(async (callback) => {
    const unlock: Array<() => void> = [];
    const tx = {
      execute: async (query: SQL) => {
        const { sql, params } = dialect.sqlToQuery(query);
        const table = /from "(\w+)"/.exec(sql)?.[1];
        const key = `${table}:${params[0]}`;
        const previous = locks.get(key) ?? Promise.resolve();
        let release = () => {};
        locks.set(key, new Promise<void>((resolve) => { release = resolve; }));
        await previous;
        unlock.push(release);
      },
      select: (selection?: Record<string, unknown>) => ({
        from: (table: Table) => ({
          where: (condition: SQL) => {
            const read = async () => {
              const rows = matching(getTableName(table), condition);
              return selection && "value" in selection ? [{ value: rows.length }] : rows.map((row) => ({ ...row }));
            };
            return { limit: read, then: (resolve: (rows: unknown[]) => void) => read().then(resolve) };
          },
        }),
      }),
      update: (table: Table) => ({
        set: (patch: Record<string, unknown>) => ({
          where: async (condition: SQL) => {
            matching(getTableName(table), condition).forEach((row) => Object.assign(row, patch));
          },
        }),
      }),
      insert: (table: Table) => ({
        values: (values: Record<string, unknown>) => {
          const row = { id: crypto.randomUUID(), ...values };
          tables[getTableName(table)].push(row);
          return { returning: async () => [row], onConflictDoNothing: async () => undefined };
        },
      }),
    };
    try {
      return await callback(tx);
    } finally {
      unlock.reverse().forEach((release) => release());
    }
  });
  return tables;
}

function capture(jobId: string) {
  return captureGeneration({
    jobId, attemptId: `attempt-${jobId}`,
    output: { projectId: "project", ownerId: userId, shotId: `shot-${jobId}`, version: 1,
      r2Key: "output", previewR2Key: "preview", mimeType: "image/png", sizeBytes: 100,
      checksumSha256: "checksum", width: 1024, height: 1024 },
  });
}

function release(jobId: string) {
  return releaseGeneration({ jobId, attemptId: `attempt-${jobId}`, attemptState: "failed",
    failureCode: "test", publicError: "Test failure", privateError: "Test failure" });
}

describe("concurrent generation settlement", () => {
  beforeEach(() => { transactionMock.mockReset(); });

  it.each([
    { captures: 3, releases: 0 },
    { captures: 0, releases: 3 },
    { captures: 1, releases: 2 },
  ])("settles $captures captures and $releases releases without losing hold totals", async ({ captures, releases }) => {
    const tables = settlementDatabase();
    await Promise.all(jobIds.map((jobId, index) => index < captures ? capture(jobId) : release(jobId)));
    expect(tables.credit_holds[0]).toMatchObject({ remainingCredits: 0, capturedCredits: captures * 40, releasedCredits: releases * 40 });
    expect(tables.credit_accounts[0]).toMatchObject({ heldCredits: 0, availableCredits: 880 + releases * 40 });
    expect(tables.credit_ledger).toHaveLength(3);
    expect(tables.generation_batches[0]).toMatchObject({ completedJobs: captures, failedJobs: releases });
    expect(tables.generation_outputs).toHaveLength(captures);
  });

  it("does not debit or refund a settled job again on duplicate delivery", async () => {
    const tables = settlementDatabase();
    await Promise.all([capture(jobIds[0]), capture(jobIds[0]), release(jobIds[1]), release(jobIds[1])]);
    expect(tables.credit_holds[0]).toMatchObject({ remainingCredits: 40, capturedCredits: 40, releasedCredits: 40 });
    expect(tables.credit_accounts[0]).toMatchObject({ availableCredits: 920, heldCredits: 40 });
    expect(tables.credit_ledger).toHaveLength(2);
    expect(tables.generation_outputs).toHaveLength(1);
  });

  it("rejects a late capture after a refund without spending another job's hold", async () => {
    const tables = settlementDatabase();
    await release(jobIds[0]);
    await expect(capture(jobIds[0])).rejects.toThrow("its credits were released");
    expect(tables.credit_holds[0]).toMatchObject({ remainingCredits: 80, capturedCredits: 0, releasedCredits: 40 });
    expect(tables.credit_accounts[0]).toMatchObject({ availableCredits: 920, heldCredits: 80 });
    expect(tables.credit_ledger).toHaveLength(1);
    expect(tables.generation_outputs).toHaveLength(0);
  });
});
