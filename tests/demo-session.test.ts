import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoSessionToken, demoSessionEmail, DEMO_SESSION_COOKIE, DEMO_STARTING_CREDITS } from "../lib/auth/demo-session";

const state = vi.hoisted(() => ({ token: undefined as string | undefined, lookup: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => name === "reshoot_demo_session" && state.token ? { value: state.token } : undefined,
}) }));
vi.mock("react", () => ({ cache: (callback: unknown) => callback }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: (query: unknown) => ({ limit: () => state.lookup(query) }) }) }) } }));

import { findCurrentUser, resolveCurrentUser } from "../lib/auth/current-user";

describe("private browser demo sessions", () => {
  beforeEach(() => { state.token = undefined; state.lookup.mockReset(); });

  it("does not grant anonymous requests access to the old shared account", async () => {
    expect(await findCurrentUser()).toBeNull();
    await expect(resolveCurrentUser()).rejects.toMatchObject({ status: 401, code: "session_required" });
    expect(state.lookup).not.toHaveBeenCalled();
  });

  it("gives different browsers independent private owner identities", async () => {
    const firstToken = createDemoSessionToken();
    const secondToken = createDemoSessionToken();
    const emails = [demoSessionEmail(firstToken), demoSessionEmail(secondToken)];
    state.lookup.mockImplementation((condition) => {
      const { params } = new PgDialect().sqlToQuery(condition);
      const index = emails.indexOf(params[0] as string);
      return index < 0 ? [] : [{ id: `owner-${index}`, email: emails[index], isDemo: true }];
    });
    state.token = firstToken;
    expect(await resolveCurrentUser()).toMatchObject({ id: "owner-0", email: "demo@reshoot.local" });
    state.token = secondToken;
    expect(await resolveCurrentUser()).toMatchObject({ id: "owner-1", email: "demo@reshoot.local" });
    expect(emails[0]).not.toEqual(emails[1]);
    expect(emails[0]).not.toContain(firstToken);
  });

  it("rejects malformed cookies, missing sessions and non-demo identities", async () => {
    state.token = "00000000-0000-4000-8000-000000000001";
    expect(await findCurrentUser()).toBeNull();
    state.token = createDemoSessionToken();
    state.lookup.mockResolvedValue([]);
    expect(await findCurrentUser()).toBeNull();
    state.lookup.mockResolvedValue([{ id: "real-account", isDemo: false }]);
    expect(await findCurrentUser()).toBeNull();
  });

  it("uses a high-entropy cookie and the agreed starting credit allocation", () => {
    expect(createDemoSessionToken()).toMatch(/^[a-f0-9]{64}$/);
    expect(DEMO_SESSION_COOKIE).toBe("reshoot_demo_session");
    expect(DEMO_STARTING_CREDITS).toBe(1_000);
  });
});
