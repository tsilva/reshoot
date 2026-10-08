import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  setCookie: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: state.setCookie }) }));
vi.mock("@/lib/auth/current-user", () => ({ findCurrentUser: async () => state.user }));
vi.mock("@/lib/db", () => ({ db: { transaction: state.transaction } }));

import { POST } from "../app/api/demo-session/route";

describe("starting a testing workspace", () => {
  beforeEach(() => { state.user = null; state.setCookie.mockReset(); state.transaction.mockReset(); });

  it("creates an owner, 1,000-credit account and matching grant in one transaction", async () => {
    const inserted: Array<{ table: string; values: Record<string, unknown> }> = [];
    state.transaction.mockImplementation(async (callback) => callback({
      insert: (table: Table) => ({ values: (values: Record<string, unknown>) => {
        inserted.push({ table: getTableName(table), values });
        return { returning: async () => [{ id: "account" }] };
      } }),
    }));
    const response = await POST(new Request("https://reshoot.tsilva.eu/api/demo-session", {
      method: "POST", headers: { origin: "https://reshoot.tsilva.eu" },
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://reshoot.tsilva.eu/projects");
    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(inserted.map((item) => item.table)).toEqual(["users", "credit_accounts", "credit_ledger"]);
    expect(inserted[1].values).toMatchObject({ availableCredits: 1000, lifetimeGrantedCredits: 1000 });
    expect(inserted[2].values).toMatchObject({ type: "grant", amountCredits: 1000, availableDelta: 1000, availableAfter: 1000, heldDelta: 0 });
    expect(inserted[0].values.id).toBe(inserted[1].values.userId);
    expect(inserted[0].values.id).toBe(inserted[2].values.userId);
    expect(state.setCookie).toHaveBeenCalledWith("reshoot_demo_session", expect.stringMatching(/^[a-f0-9]{64}$/), expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", path: "/" }));
  });

  it("resumes an existing workspace without adding more credits", async () => {
    state.user = { id: "existing-owner" };
    const response = await POST(new Request("https://reshoot.tsilva.eu/api/demo-session", {
      method: "POST", headers: { origin: "https://reshoot.tsilva.eu" },
    }));
    expect(response.status).toBe(303);
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.setCookie).not.toHaveBeenCalled();
  });

  it("rejects session creation from another origin before any credit grant", async () => {
    const response = await POST(new Request("https://reshoot.tsilva.eu/api/demo-session", {
      method: "POST", headers: { origin: "https://another.example" },
    }));
    expect(response.status).toBe(403);
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.setCookie).not.toHaveBeenCalled();
  });
});
