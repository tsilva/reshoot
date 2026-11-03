import { getTableName, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoSessionEmail } from "../lib/auth/demo-session";

const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  lookup: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => name === "reshoot_demo_session" && state.token ? { value: state.token } : undefined,
}) }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("react", () => ({ cache: (callback: unknown) => callback }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ where: (query: unknown) => ({
    limit: () => state.lookup(new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]).params[0]),
  }) }) }),
  transaction: state.transaction,
} }));

import { findLegacyDemoUser, resolveCurrentUser } from "../lib/auth/current-user";

const sharedEmail = "shared-demo@reshoot.local";
const sharedUser = { id: "shared", email: sharedEmail, isDemo: true };

describe("shared demo workspace", () => {
  beforeEach(() => {
    state.token = undefined;
    state.lookup.mockReset();
    state.transaction.mockReset();
  });

  it("uses the same account with or without an old browser session", async () => {
    const legacyToken = "a".repeat(64);
    const legacyEmail = demoSessionEmail(legacyToken);
    const legacyUser = { id: "private", email: legacyEmail, isDemo: true };
    state.lookup.mockImplementation((email) => email === sharedEmail ? [sharedUser] : [legacyUser]);
    expect(await resolveCurrentUser()).toBe(sharedUser);
    expect(await findLegacyDemoUser()).toBeUndefined();
    state.token = legacyToken;
    expect(await resolveCurrentUser()).toBe(sharedUser);
    expect(await findLegacyDemoUser()).toBe(legacyUser);
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it.each([true, false])("grants credits only to the request that creates the shared account (created: %s)", async (created) => {
    const inserted: Array<{ table: string; values: Record<string, unknown> }> = [];
    state.lookup.mockResolvedValueOnce([]).mockResolvedValueOnce([sharedUser]);
    state.transaction.mockImplementation(async (callback) => callback({
      insert: (table: Table) => ({ values: (values: Record<string, unknown>) => {
        const name = getTableName(table);
        inserted.push({ table: name, values });
        return {
          onConflictDoNothing: () => ({ returning: async () => created ? [{ id: "shared" }] : [] }),
          returning: async () => [{ id: "account" }],
        };
      } }),
    }));

    expect(await resolveCurrentUser()).toBe(sharedUser);
    expect(inserted.map(({ table }) => table)).toEqual(created
      ? ["users", "credit_accounts", "credit_ledger"] : ["users"]);
    expect(inserted[0].values).toMatchObject({ email: sharedEmail, legacyImportCompletedAt: expect.any(Date) });
    if (created) {
      expect(inserted[1].values).toMatchObject({ userId: "shared", availableCredits: 1000 });
      expect(inserted[2].values).toMatchObject({ accountId: "account", userId: "shared", type: "grant", amountCredits: 1000 });
    }
  });
});
