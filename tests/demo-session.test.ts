import { getTableName, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoSessionEmail } from "../lib/auth/demo-session";
import { safeReturnPath } from "../lib/auth/config";

const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  lookup: vi.fn(), transaction: vi.fn(), auth: vi.fn(), profile: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: state.auth, currentUser: state.profile }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => name === "reshoot_demo_session" && state.token ? { value: state.token } : undefined,
}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("react", () => ({ cache: (callback: unknown) => callback }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ where: (query: unknown) => ({
    limit: () => state.lookup(new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]).params[0]),
  }) }) }),
  transaction: state.transaction,
} }));

import { findCurrentUser, findLegacyDemoUser, resolveCurrentUser } from "../lib/auth/current-user";

const user = { id: "local-user", clerkUserId: "user_one", email: "person@example.com", isDemo: true };

describe("Clerk account isolation", () => {
  beforeEach(() => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
    state.token = undefined;
    for (const mock of [state.lookup, state.transaction, state.auth, state.profile]) mock.mockReset();
    state.auth.mockResolvedValue({ userId: "user_one" });
  });

  it("does not authenticate with a demo cookie or initialize a shared account", async () => {
    state.token = "a".repeat(64);
    state.auth.mockResolvedValue({ userId: null });
    expect(await findCurrentUser()).toBeNull();
    await expect(resolveCurrentUser()).rejects.toMatchObject({ status: 401 });
    expect(state.lookup).not.toHaveBeenCalled();
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it("fails closed when Clerk is not configured", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(await findCurrentUser()).toBeNull();
    expect(state.auth).not.toHaveBeenCalled();
    expect(state.lookup).not.toHaveBeenCalled();
  });

  it("resolves by the verified Clerk ID, never by an email or browser user ID", async () => {
    state.lookup.mockResolvedValue([user]);
    expect(await resolveCurrentUser()).toBe(user);
    expect(state.lookup).toHaveBeenCalledWith("user_one");
    expect(state.profile).not.toHaveBeenCalled();
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it.each([true, false])("creates an empty wallet only for the winning account creation (created: %s)", async (created) => {
    const inserted: Array<{ table: string; values: Record<string, unknown> }> = [];
    state.lookup.mockResolvedValueOnce([]).mockResolvedValueOnce([user]);
    state.profile.mockResolvedValue({ id: "user_one", fullName: "Test Person", primaryEmailAddressId: "email_one", emailAddresses: [{ id: "email_one", emailAddress: user.email }] });
    state.transaction.mockImplementation(async (callback) => callback({
      insert: (table: Table) => ({ values: (values: Record<string, unknown>) => {
        inserted.push({ table: getTableName(table), values });
        return { onConflictDoNothing: () => ({ returning: async () => created ? [{ id: user.id }] : [] }), then: (resolve: (value: unknown) => void) => resolve(undefined) };
      } }),
    }));
    expect(await resolveCurrentUser()).toBe(user);
    expect(inserted.map(({ table }) => table)).toEqual(created ? ["users", "credit_accounts"] : ["users"]);
    expect(inserted[0].values).toMatchObject({ clerkUserId: "user_one", isDemo: true, displayName: "Test Person" });
    if (created) expect(inserted[1].values).toEqual({ userId: user.id });
  });

  it("rejects an inconsistent profile before writing an account", async () => {
    state.lookup.mockResolvedValue([]);
    state.profile.mockResolvedValue({ id: "user_other" });
    await expect(resolveCurrentUser()).rejects.toMatchObject({ status: 401 });
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it("retains cookie-proven legacy ownership without treating it as a signed-in session", async () => {
    state.token = "b".repeat(64);
    const legacy = { id: "old", email: demoSessionEmail(state.token), isDemo: true, clerkUserId: null };
    state.lookup.mockResolvedValue([legacy]);
    expect(await findLegacyDemoUser()).toBe(legacy);
    expect(state.lookup).toHaveBeenCalledWith(legacy.email);
  });
});

describe("safe sign-in return destinations", () => {
  it.each(["https://example.com", "//example.com", "/\\example.com", "/\n/example.com", undefined, ["/projects"]])("rejects unsafe return destination %s", (value) => {
    expect(safeReturnPath(value)).toBe("/");
  });
  it("preserves same-origin project and wallet paths", () => {
    expect(safeReturnPath("/projects/123?wallet=open")).toBe("/projects/123?wallet=open");
  });
});
