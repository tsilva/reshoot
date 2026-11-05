import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { refundableCredits, spendableBalance } from "../lib/subscriptions/allowance";
import { MONTHLY_PLANS } from "../lib/subscriptions/catalog";
const transaction = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { transaction } }));
import { expireMonthlyAllowance, synchronizeSubscription, type SubscriptionSnapshot } from "../lib/subscriptions/service";

type Row = Record<string, unknown>;
const userId = "00000000-0000-4000-8000-000000000001";
const now = new Date();
const start = new Date(now.getTime() - 10_000);
const end = new Date(now.getTime() + 30 * 86400_000);
const snapshot: SubscriptionSnapshot = { userId, id: "sub_one", customerId: "cus_one", planSlug: "studio", status: "active", cancelAtPeriodEnd: false, periodEnd: end, createdAt: start };
const invoice = { id: "in_one", subscriptionId: "sub_one", customerId: "cus_one", planSlug: "studio" as const, periodStart: start, periodEnd: end };

function database() {
  const tables: Record<string, Row[]> = {
    users: [{ id: userId, isDemo: true }],
    credit_accounts: [{ id: "account", userId, availableCredits: 1000, monthlyAvailableCredits: 0, monthlyPeriodStart: null, monthlyPeriodEnd: null, heldCredits: 50, lifetimeGrantedCredits: 1050 }],
    credit_ledger: [], subscriptions: [], subscription_invoices: [],
  };
  const dialect = new PgDialect();
  function matching(table: string, condition: SQL) {
    const { sql, params } = dialect.sqlToQuery(condition);
    const columns = [...sql.matchAll(/"\w+"\."(\w+)" = \$\d+/g)].map(match => match[1].replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()));
    return tables[table].filter(row => columns.every((column, index) => row[column] === params[index]));
  }
  let lock = Promise.resolve();
  transaction.mockImplementation(async callback => {
    const previous = lock;
    let unlock = () => {};
    lock = new Promise<void>(resolve => { unlock = resolve; });
    await previous;
    const backup = structuredClone(tables);
    const tx = {
      execute: async () => {},
      select: () => ({ from: (table: Table) => ({ where: (condition: SQL) => ({ limit: async () => matching(getTableName(table), condition).map(row => ({ ...row })) }) }) }),
      update: (table: Table) => ({ set: (patch: Row) => ({ where: async (condition: SQL) => { matching(getTableName(table), condition).forEach(row => Object.assign(row, patch)); } }) }),
      insert: (table: Table) => ({ values: (values: Row) => {
        const name = getTableName(table);
        let ignore = false;
        let upsert: Row | undefined;
        async function run() {
          const existing = tables[name].find(row => name === "subscriptions" ? row.userId === values.userId
            : name === "subscription_invoices" ? row.stripeInvoiceId === values.stripeInvoiceId || row.stripeSubscriptionId === values.stripeSubscriptionId && (row.periodStart as Date).getTime() === (values.periodStart as Date).getTime() : false);
          if (existing) {
            if (upsert) { Object.assign(existing, upsert); return [existing]; }
            if (ignore) return [];
            throw new Error("unique violation");
          }
          const row = { id: crypto.randomUUID(), ...values };
          tables[name].push(row); return [row];
        }
        const result = { returning: run, then: (resolve: (value: Row[]) => void, reject: (error: unknown) => void) => run().then(resolve, reject),
          onConflictDoNothing: () => { ignore = true; return result; },
          onConflictDoUpdate: ({ set }: { set: Row }) => { upsert = set; return result; } };
        return result;
      } }),
    };
    try { return await callback(tx); } catch (error) { for (const name of Object.keys(tables)) tables[name] = backup[name]; throw error; } finally { unlock(); }
  });
  return tables;
}

beforeEach(() => { transaction.mockReset(); });
describe("monthly invoice accounting", () => {
  it("grants a paid month once despite simultaneous duplicate deliveries, retaining legacy and held credits", async () => {
    const tables = database();
    await Promise.all([1, 2, 3].map(() => synchronizeSubscription(userId, async () => snapshot, invoice)));
    expect(tables.credit_accounts[0]).toMatchObject({ availableCredits: 4000, monthlyAvailableCredits: 3000, heldCredits: 50 });
    expect(tables.subscription_invoices).toHaveLength(1);
    expect(tables.credit_ledger).toHaveLength(1);
  });
  it("does not grant for a status change or failed payment", async () => {
    const tables = database();
    await synchronizeSubscription(userId, async () => ({ ...snapshot, status: "past_due" }));
    expect(tables.subscriptions[0].status).toBe("past_due");
    expect(tables.credit_accounts[0].availableCredits).toBe(1000);
    expect(tables.credit_ledger).toHaveLength(0);
  });
  it("expires unspent monthly credits on renewal without expiring legacy credits or in-flight holds", async () => {
    const tables = database();
    Object.assign(tables.credit_accounts[0], { availableCredits: 1400, monthlyAvailableCredits: 400, monthlyPeriodStart: new Date(start.getTime() - 30 * 86400_000), monthlyPeriodEnd: start });
    await synchronizeSubscription(userId, async () => snapshot, invoice);
    expect(tables.credit_accounts[0]).toMatchObject({ availableCredits: 4000, monthlyAvailableCredits: 3000, heldCredits: 50 });
    expect(tables.credit_ledger.map(row => row.availableDelta)).toEqual([-400, 3000]);
  });
  it("does not refresh the allowance for an old, delayed invoice", async () => {
    const tables = database();
    await synchronizeSubscription(userId, async () => snapshot, invoice);
    await synchronizeSubscription(userId, async () => snapshot, { ...invoice, id: "in_old", periodStart: new Date(start.getTime() - 30 * 86400_000), periodEnd: start });
    expect(tables.credit_accounts[0].availableCredits).toBe(4000);
    expect(tables.credit_ledger).toHaveLength(1);
  });
  it("deduplicates distinct invoice IDs for the same paid period", async () => {
    const tables = database();
    await synchronizeSubscription(userId, async () => snapshot, invoice);
    await synchronizeSubscription(userId, async () => snapshot, { ...invoice, id: "in_duplicate" });
    expect(tables.credit_accounts[0].availableCredits).toBe(4000);
    expect(tables.subscription_invoices).toHaveLength(1);
  });
  it("preserves access to the paid allowance when cancellation is scheduled", async () => {
    const tables = database();
    await synchronizeSubscription(userId, async () => snapshot, invoice);
    await synchronizeSubscription(userId, async () => ({ ...snapshot, cancelAtPeriodEnd: true }));
    expect(tables.subscriptions[0].cancelAtPeriodEnd).toBe(true);
    expect(tables.credit_accounts[0].monthlyAvailableCredits).toBe(3000);
  });
  it("does not allow an old subscription event to replace its newer replacement", async () => {
    const tables = database();
    await synchronizeSubscription(userId, async () => ({ ...snapshot, id: "sub_new", createdAt: new Date(), status: "canceled" }));
    await synchronizeSubscription(userId, async () => ({ ...snapshot, status: "canceled" }));
    expect(tables.subscriptions[0].stripeSubscriptionId).toBe("sub_new");
  });
  it("rejects cross-account and cross-customer invoices atomically", async () => {
    const tables = database();
    await expect(synchronizeSubscription(userId, async () => ({ ...snapshot, userId: "other" }), invoice)).rejects.toThrow("ownership");
    await expect(synchronizeSubscription(userId, async () => snapshot, { ...invoice, customerId: "cus_other" })).rejects.toThrow("mismatch");
    expect(tables.credit_accounts[0].availableCredits).toBe(1000);
    expect(tables.subscription_invoices).toHaveLength(0);
  });
  it("does not credit non-test accounts through the test integration", async () => {
    const tables = database(); tables.users[0].isDemo = false;
    await expect(synchronizeSubscription(userId, async () => snapshot, invoice)).rejects.toMatchObject({ status: 409 });
    expect(tables.credit_ledger).toHaveLength(0);
  });
});

describe("expiry and generation funding", () => {
  it("excludes expired monthly allowance at the exact boundary even before lazy cleanup", () => {
    expect(spendableBalance({ availableCredits: 1300, monthlyAvailableCredits: 300, monthlyPeriodEnd: now }, now)).toBe(1000);
  });
  it("restores monthly funding only into the same unexpired paid period", () => {
    const job = { quotedCredits: 70, monthlyCredits: 50, monthlyPeriodEnd: end };
    expect(refundableCredits(job, end, now)).toEqual({ total: 70, monthly: 50 });
    expect(refundableCredits(job, new Date(end.getTime() + 1), now)).toEqual({ total: 20, monthly: 0 });
    expect(refundableCredits(job, end, end)).toEqual({ total: 20, monthly: 0 });
    expect(refundableCredits({ quotedCredits: 70 }, end, now)).toEqual({ total: 70, monthly: 0 });
  });
  it("cleans up an expired balance only once under the account lock", async () => {
    const tables = database();
    Object.assign(tables.credit_accounts[0], { availableCredits: 1200, monthlyAvailableCredits: 200, monthlyPeriodEnd: now });
    // Exercise the actual expiry writer through the transaction double.
    await transaction(async (tx: Parameters<typeof expireMonthlyAllowance>[0]) => {
      const account = await expireMonthlyAllowance(tx, tables.credit_accounts[0] as never, now);
      await expireMonthlyAllowance(tx, account, now);
    });
    expect(tables.credit_accounts[0]).toMatchObject({ availableCredits: 1000, monthlyAvailableCredits: 0, heldCredits: 50 });
    expect(tables.credit_ledger).toHaveLength(1);
  });
  it("makes Studio objectively the best value per credit", () => {
    const [starter, studio, pro] = MONTHLY_PLANS;
    expect(studio.usd / studio.credits).toBeLessThan(starter.usd / starter.credits);
    expect(studio.usd / studio.credits).toBeLessThan(pro.usd / pro.credits);
  });
});
