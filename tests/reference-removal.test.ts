import { getTableName, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  project: { primaryAssetId: "photo", status: "ready" } as { primaryAssetId: string; status: string } | null,
  shot: false, removed: true, next: "next" as string | null,
  events: [] as string[], filters: [] as unknown[], projectUpdate: {} as Record<string, unknown>,
}));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/db", () => ({ db: { transaction: async (fn: (tx: unknown) => Promise<void>) => fn({
  execute: async () => { state.events.push("lock"); },
  select: () => ({ from: (table: Table) => ({ where: () => {
    const name = getTableName(table);
    if (name === "projects") return { limit: () => ({ for: async () => { state.events.push("project"); return state.project ? [state.project] : []; } }) };
    if (name === "shots") return { limit: async () => { state.events.push("shots"); return state.shot ? [{ id: "shot" }] : []; } };
    return { orderBy: () => ({ limit: async () => { state.events.push("next"); return state.next ? [{ id: state.next }] : []; } }) };
  } }) }),
  update: (table: Table) => ({ set: (values: Record<string, unknown>) => ({ where: (filter: unknown) => {
    if (getTableName(table) === "assets") {
      state.filters.push(filter);
      expect(values).toMatchObject({ status: "failed", failureCode: "removed_reference" });
      return { returning: async () => { state.events.push("remove"); return state.removed ? [{ id: "photo" }] : []; } };
    }
    state.events.push("projectUpdate"); state.projectUpdate = values;
    return Promise.resolve();
  } }) }),
}) } }));
import { DELETE } from "../app/api/projects/[projectId]/references/[assetId]/route";
const request = () => DELETE(new Request("https://reshoot.test/reference", { method: "DELETE" }), {
  params: Promise.resolve({ projectId: "project", assetId: "photo" }),
});

describe("removing shoot references", () => {
  beforeEach(() => {
    state.project = { primaryAssetId: "photo", status: "ready" }; state.shot = false;
    state.removed = true; state.next = "next"; state.events = []; state.filters = []; state.projectUpdate = {};
  });
  it("serializes with generation, scopes the ready original, and promotes the next photo", async () => {
    expect((await request()).status).toBe(204);
    expect(state.events).toEqual(["lock", "project", "shots", "remove", "next", "projectUpdate"]);
    expect(state.projectUpdate).toMatchObject({ primaryAssetId: "next", status: "ready" });
    const query = new PgDialect().sqlToQuery(state.filters[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual(["photo", "project", "owner", "original", "ready"]);
  });
  it("returns to a blank draft after removing the last reference", async () => {
    state.next = null;
    expect((await request()).status).toBe(204);
    expect(state.projectUpdate).toMatchObject({ primaryAssetId: null, status: "draft" });
  });
  it("preserves the primary when a supporting photo is removed", async () => {
    state.project!.primaryAssetId = "anchor";
    expect((await request()).status).toBe(204);
    expect(state.projectUpdate.primaryAssetId).toBe("anchor");
  });
  it.each(["missing project", "missing photo", "generation started", "archived"])("rejects %s", async (scenario) => {
    if (scenario === "missing project") state.project = null;
    if (scenario === "missing photo") state.removed = false;
    if (scenario === "generation started") state.shot = true;
    if (scenario === "archived") state.project!.status = "archived";
    expect((await request()).status).toBe(scenario.startsWith("missing") ? 404 : 409);
    expect(state.events).not.toContain("projectUpdate");
    if (scenario !== "missing photo") expect(state.events).not.toContain("remove");
  });
});
