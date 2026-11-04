import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireProject: vi.fn(), deleteObject: vi.fn(),
  events: [] as string[], updates: [] as Array<{ table: string; values: Record<string, unknown>; condition: unknown }>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/projects/service", () => ({ requireOwnedProject: state.requireProject, getProjectDetail: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ deleteObject: state.deleteObject }));
vi.mock("@/lib/db", () => ({ db: {
  transaction: async (callback: (tx: unknown) => Promise<void>) => {
    state.events.push("begin");
    try {
      await callback({ update: (table: Table) => ({ set: (values: Record<string, unknown>) => ({
        where: async (condition: unknown) => {
          const name = getTableName(table);
          state.events.push(name);
          state.updates.push({ table: name, values, condition });
        },
      }) }) });
      state.events.push("commit");
    } catch (error) {
      state.events.push("rollback");
      throw error;
    }
  },
} }));

import { DELETE } from "../app/api/projects/[projectId]/route";
import { ApiError } from "../lib/api/errors";

const keys = ["views-v2.zip", "turntable-v2.zip", "views-v1.zip", "turntable-v1.zip"]
  .map((name) => `projects/project/exports/${name}`);
const request = () => DELETE(new Request("https://reshoot.test/api/projects/project", { method: "DELETE" }), {
  params: Promise.resolve({ projectId: "project" }),
});

describe("project deletion removes stored ZIPs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.events = [];
    state.updates = [];
    state.requireProject.mockResolvedValue({ id: "project" });
    state.deleteObject.mockImplementation(async (key: string) => { state.events.push(key); });
  });

  it("deletes current and legacy ZIPs before committing project deletion", async () => {
    expect((await request()).status).toBe(204);
    expect(state.requireProject).toHaveBeenCalledWith("owner", "project");
    expect(state.events).toEqual(["begin", "projects", "assets", ...keys, "commit"]);
    expect(state.deleteObject.mock.calls).toEqual(keys.map((key) => [key]));
    expect(state.updates[0].values.status).toBe("deleted");
    const deletedAt = state.updates[0].values.deletedAt as Date;
    const purgeAfter = state.updates[0].values.purgeAfter as Date;
    expect(purgeAfter.getTime() - deletedAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(state.updates[1].values.retainedUntil).toEqual(purgeAfter);
    for (const update of state.updates) {
      expect(new PgDialect().sqlToQuery(update.condition as SQL).params).toEqual(["project", "owner"]);
    }
  });

  it("waits for all bucket deletions and rolls back on failure so deletion can be retried", async () => {
    let finishLast!: () => void;
    const lastDeletion = new Promise<void>((resolve) => { finishLast = resolve; });
    const storageError = new Error("Storage unavailable");
    state.deleteObject.mockImplementation(async (key: string) => {
      if (key === keys[0]) throw storageError;
      if (key === keys.at(-1)) await lastDeletion;
      state.events.push(key);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = request();
      await vi.waitFor(() => expect(state.deleteObject).toHaveBeenCalledTimes(4));
      expect(state.events).not.toContain("rollback");
      finishLast();
      expect((await response).status).toBe(500);
      expect(state.events.at(-1)).toBe("rollback");
      expect(state.events).not.toContain("commit");
    } finally {
      finishLast();
      log.mockRestore();
    }
  });

  it("never deletes bucket objects for an unowned or missing project", async () => {
    state.requireProject.mockRejectedValue(new ApiError(404, "project_not_found", "Project not found."));
    expect((await request()).status).toBe(404);
    expect(state.events).toEqual([]);
    expect(state.deleteObject).not.toHaveBeenCalled();
  });
});
