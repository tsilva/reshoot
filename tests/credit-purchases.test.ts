import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { transaction: transactionMock } }));
import { createDemoPurchase } from "../lib/credits/service";

type Row = { id: string; [key: string]: unknown };
function purchaseDatabase() {
  const tables: Record<string, Row[]> = {
    credit_accounts: ["one", "two"].map((userId) => ({ id: `account-${userId}`, userId, availableCredits: 100, heldCredits: 50, lifetimeGrantedCredits: 150 })),
    credit_packs: [
      { id: "pack-starter", slug: "starter", name: "Starter", credits: 1000, usdMicros: 10000000, active: true },
      { id: "pack-pro", slug: "pro", name: "Pro", credits: 5000, usdMicros: 50000000, active: true },
    ], test_purchases: [], credit_ledger: [],
  };
  const locks = new Map<string, Promise<void>>();
  const dialect = new PgDialect();
  function matching(table: string, condition: SQL) {
    const { sql, params } = dialect.sqlToQuery(condition);
    const columns = [...sql.matchAll(/"\w+"\."(\w+)" = \$\d+/g)].map((match) => match[1].replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()));
    return tables[table].filter((row) => columns.every((column, index) => row[column] === params[index]));
  }
  transactionMock.mockImplementation(async (callback) => {
    const unlock: Array<() => void> = [];
    const tx = {
      execute: async (query: SQL) => {
        const key = String(dialect.sqlToQuery(query).params[0]);
        const previous = locks.get(key) ?? Promise.resolve();
        let release = () => {};
        locks.set(key, new Promise<void>((resolve) => { release = resolve; }));
        await previous; unlock.push(release);
      },
      select: () => ({ from: (table: Table) => ({ where: (condition: SQL) => ({ limit: async () => matching(getTableName(table), condition).map((row) => ({ ...row })) }) }) }),
      insert: (table: Table) => ({ values: (values: Record<string, unknown>) => ({ returning: async () => {
        const row = { id: crypto.randomUUID(), ...values };
        tables[getTableName(table)].push(row); return [row];
      } }) }),
      update: (table: Table) => ({ set: (patch: Record<string, unknown>) => ({ where: async (condition: SQL) => {
        matching(getTableName(table), condition).forEach((row) => Object.assign(row, patch));
      } }) }),
    };
    try { return await callback(tx); } finally { unlock.reverse().forEach((release) => release()); }
  });
  return tables;
}
const input = { userId: "one", isDemoUser: true, packSlug: "starter", idempotencyKey: "attempt-one" };

describe("test purchase accounting", () => {
  beforeEach(() => {
    transactionMock.mockReset();
    vi.stubEnv("RESHOOT_PAYMENTS_MODE", "simulated");
  });
  it("serializes concurrent retries into exactly one purchase and ledger grant", async () => {
    const tables = purchaseDatabase();
    const results = await Promise.all([createDemoPurchase(input), createDemoPurchase(input), createDemoPurchase(input)]);
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(tables.test_purchases).toHaveLength(1);
    expect(tables.credit_ledger).toHaveLength(1);
    expect(tables.credit_accounts[0]).toMatchObject({ availableCredits: 1100, heldCredits: 50, lifetimeGrantedCredits: 1150 });
    expect(tables.credit_accounts[1]).toMatchObject({ availableCredits: 100, heldCredits: 50 });
  });
  it("adds distinct simultaneous purchases without losing either grant", async () => {
    const tables = purchaseDatabase();
    await Promise.all([createDemoPurchase(input), createDemoPurchase({ ...input, idempotencyKey: "attempt-two" })]);
    expect(tables.credit_accounts[0]).toMatchObject({ availableCredits: 2100, heldCredits: 50 });
    expect(tables.test_purchases).toHaveLength(2);
    expect(tables.credit_ledger.map((row) => row.availableAfter)).toEqual([1100, 2100]);
  });
  it("scopes idempotency keys to the account", async () => {
    const tables = purchaseDatabase();
    await Promise.all([createDemoPurchase(input), createDemoPurchase({ ...input, userId: "two" })]);
    expect(tables.test_purchases).toHaveLength(2);
    expect(tables.credit_accounts.map((row) => row.availableCredits)).toEqual([1100, 1100]);
  });
  it("rejects reusing a successful checkout for a different pack", async () => {
    const tables = purchaseDatabase();
    await createDemoPurchase(input);
    await expect(createDemoPurchase({ ...input, packSlug: "pro" })).rejects.toMatchObject({ status: 409 });
    expect(tables.credit_accounts[0].availableCredits).toBe(1100);
    expect(tables.test_purchases).toHaveLength(1);
  });
  it("cannot mint credits into a non-test account even with simulated mode enabled", async () => {
    await expect(createDemoPurchase({ ...input, isDemoUser: false })).rejects.toMatchObject({ status: 503 });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
