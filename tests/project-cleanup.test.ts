import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  outputs: [] as Array<{ output: string; preview: string }>,
  deleteObject: vi.fn(), deleteRows: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/r2", () => ({ deleteObject: state.deleteObject }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: (table: Table) => {
    const query = {
      leftJoin: () => query,
      where: () => {
        switch (getTableName(table)) {
          case "projects": return { limit: async () => [{ id: "project", ownerId: "owner" }] };
          case "assets": return Promise.resolve([]);
          default: return Promise.resolve(state.outputs);
        }
      },
    };
    return query;
  } }),
  delete: () => ({ where: state.deleteRows }),
} }));

import { cleanupExpiredProjectObjects } from "../lib/projects/cleanup";

const keys = ["views-v2.zip", "turntable-v2.zip", "views-v1.zip", "turntable-v1.zip"]
  .map((name) => `projects/project/exports/${name}`);

describe("retention cleanup of project ZIPs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.outputs = [];
  });

  it("removes leftover ZIPs even when no generated image records remain", async () => {
    expect(await cleanupExpiredProjectObjects()).toEqual({ projects: 1, deletedObjects: 4 });
    expect(state.deleteObject.mock.calls).toEqual(keys.map((key) => [key]));
    expect(state.deleteRows).not.toHaveBeenCalled();
  });

  it("removes images and both versions of both ZIP formats before deleting output records", async () => {
    state.outputs = [{ output: "original", preview: "preview" }];
    state.deleteRows.mockImplementation(async () => {
      expect(state.deleteObject.mock.calls).toEqual(["original", "preview", ...keys].map((key) => [key]));
    });
    expect(await cleanupExpiredProjectObjects()).toEqual({ projects: 1, deletedObjects: 6 });
    expect(state.deleteRows).toHaveBeenCalledOnce();
  });

  it("keeps output records for retry if a ZIP deletion fails", async () => {
    state.outputs = [{ output: "original", preview: "preview" }];
    state.deleteObject.mockImplementation(async (key: string) => {
      if (key === keys[0]) throw new Error("Storage unavailable");
    });
    await expect(cleanupExpiredProjectObjects()).rejects.toThrow("Storage unavailable");
    expect(state.deleteRows).not.toHaveBeenCalled();
  });
});
