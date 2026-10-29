import { createHash } from "node:crypto";
import { getTableName, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api/errors";

const state = vi.hoisted(() => ({
  owner: "a41e8b9c-cb8e-4cac-b138-376181096a64",
  projectId: "5392ef6c-5eb7-4825-a44d-3eb4514ce359",
  assetId: "7a3b32b6-c3a5-4dcf-adb0-8d37e39c2bb7",
  assetStatus: "pending",
  primaryAssetId: "7a3b32b6-c3a5-4dcf-adb0-8d37e39c2bb7",
  title: "Product shoot",
  firstFinalization: true,
  original: Buffer.alloc(0),
  suggest: vi.fn(), requireOwned: vi.fn(), select: vi.fn(), update: vi.fn(), insert: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: async () => ({ id: state.owner }) }));
vi.mock("@/lib/projects/service", () => ({ requireOwnedProject: state.requireOwned, listProjects: async () => [] }));
vi.mock("@/lib/projects/naming", () => ({ AUTO_PROJECT_TITLE: "Product shoot", suggestPhotoTitle: state.suggest }));
vi.mock("@/lib/storage/r2", () => ({
  headObject: async () => ({ ContentLength: state.original.length, ContentType: "image/png" }),
  getObjectBuffer: async () => state.original,
  sha256Hex: (data: Uint8Array) => createHash("sha256").update(data).digest("hex"),
  putObject: async () => "variant-checksum",
  signRead: async () => "https://private-storage.invalid/preview",
}));
vi.mock("@/lib/db", () => ({ db: {
  select: state.select, update: state.update, insert: state.insert,
  transaction: async (callback: (tx: unknown) => unknown) => callback({
    select: () => ({ from: () => ({ where: async () => [{ totalBytes: 0, totalCount: 0 }] }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
    update: (table: Table) => ({ set: () => ({ where: () => ({ returning: async () => getTableName(table) === "projects"
      ? [{ primaryAssetId: state.primaryAssetId, title: state.title }]
      : state.firstFinalization ? [{ id: state.assetId }] : [] }) }) }),
  }),
} }));

import { POST as finalize } from "../app/api/projects/[projectId]/uploads/finalize/route";
import { POST as createProject } from "../app/api/projects/route";

function finalizePhoto() {
  return finalize(new Request("https://reshoot.test/api/uploads/finalize", {
    method: "POST", body: JSON.stringify({ assetId: state.assetId }),
  }), { params: Promise.resolve({ projectId: state.projectId }) });
}

describe("naming the first saved product photo", () => {
  beforeEach(async () => {
    state.original = await sharp({ create: { width: 64, height: 64, channels: 3, background: "blue" } }).png().toBuffer();
    state.assetStatus = "pending";
    state.primaryAssetId = state.assetId;
    state.title = "Product shoot";
    state.firstFinalization = true;
    state.requireOwned.mockReset().mockResolvedValue({ id: state.projectId });
    state.suggest.mockReset().mockResolvedValue("Cobalt ceramic mug");
    state.update.mockReset().mockReturnValue({ set: () => ({ where: async () => undefined }) });
    state.select.mockReset().mockImplementation(() => ({ from: (table: Table) => ({ where: () => ({ limit: async () => getTableName(table) === "assets" ? [{
      id: state.assetId, status: state.assetStatus, r2Key: "private/source", sizeBytes: state.original.length,
      mimeType: "image/png", checksumSha256: createHash("sha256").update(state.original).digest("hex"),
    }] : [] }) }) }));
    state.insert.mockReset().mockImplementation(() => ({ values: (values: { title: string }) => ({ returning: async () => [{
      id: state.projectId, title: values.title, status: "draft", updatedAt: new Date(),
    }] }) }));
  });

  it("accepts creation without a name", async () => {
    const response = await createProject(new Request("https://reshoot.test/api/projects", { method: "POST", body: "{}" }));
    expect(response.status).toBe(201);
    expect((await response.json()).project.title).toBe("Product shoot");
  });

  it("names only the first primary photo and protects concurrent edits and ownership", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    state.update.mockReturnValue({ set });
    expect((await finalizePhoto()).status).toBe(200);
    expect(state.suggest).toHaveBeenCalledOnce();
    const supplied = state.suggest.mock.calls[0][0];
    expect((await sharp(supplied).metadata()).format).toBe("webp");
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ title: "Cobalt ceramic mug" }));
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.params).toEqual([state.projectId, state.owner, state.assetId, "Product shoot"]);
    expect(query.sql).toContain('"projects"."deleted_at" is null');
  });

  it.each(["custom title", "later photo", "ready retry", "concurrent retry"])("does not rename a %s", async (scenario) => {
    if (scenario === "custom title") state.title = "My own name";
    if (scenario === "later photo") state.primaryAssetId = "c713351c-f570-4a62-9d25-bf69a3d48f91";
    if (scenario === "ready retry") state.assetStatus = "ready";
    if (scenario === "concurrent retry") state.firstFinalization = false;
    expect((await finalizePhoto()).status).toBe(200);
    expect(state.suggest).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("preserves a saved photo when naming is unavailable", async () => {
    state.suggest.mockResolvedValue(null);
    expect((await finalizePhoto()).status).toBe(200);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("preserves a saved photo when the title update fails", async () => {
    state.update.mockReturnValue({ set: () => ({ where: async () => { throw new Error("Write unavailable"); } }) });
    expect((await finalizePhoto()).status).toBe(200);
  });

  it("rejects another owner's project before reading photos or invoking vision", async () => {
    state.requireOwned.mockRejectedValue(new ApiError(404, "project_not_found", "Project not found."));
    expect((await finalizePhoto()).status).toBe(404);
    expect(state.select).not.toHaveBeenCalled();
    expect(state.suggest).not.toHaveBeenCalled();
  });
});
