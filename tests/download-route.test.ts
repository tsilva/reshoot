import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireProject: vi.fn(),
  getObjectStream: vi.fn(),
  condition: null as SQL | null,
  rows: [] as Array<{ label: string; output: { id: string; version: number; mimeType: string; r2Key: string } }>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/projects/service", () => ({ requireOwnedProject: state.requireProject }));
vi.mock("@/lib/storage/r2", () => ({ getObjectStream: state.getObjectStream }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ innerJoin: () => ({ where: (condition: SQL) => {
    state.condition = condition;
    return { limit: async () => state.rows };
  } }) }) }),
} }));

import { ApiError } from "../lib/api/errors";
import { GET } from "../app/api/projects/[projectId]/outputs/[outputId]/download/route";
import { exportVisibleShots } from "../lib/client/export";

const request = new Request("https://reshoot.tsilva.eu/api/projects/project/outputs/output/download");
const context = { params: Promise.resolve({ projectId: "project", outputId: "output" }) };
const original = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

describe("private output downloads", () => {
  beforeEach(() => {
    state.requireProject.mockReset();
    state.getObjectStream.mockReset().mockImplementation(async () => new Response(original).body);
    state.condition = null;
    state.rows = [{ label: "Front", output: { id: "output", version: 1, mimeType: "image/jpeg", r2Key: "private/original" } }];
  });

  it("serves the original as a private same-origin attachment", async () => {
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="front-v1-output.jpg"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(original);
    expect(state.getObjectStream).toHaveBeenCalledWith("private/original");
    expect(state.requireProject).toHaveBeenCalledWith("owner", "project");
    expect(new PgDialect().sqlToQuery(state.condition!).params).toEqual(["output", "project", "owner", "owner"]);
  });

  it("puts the original bytes from the download route into the gallery ZIP", async () => {
    const fetchFile = vi.fn<typeof fetch>().mockImplementation(async () => GET(request, context));
    const archive = await exportVisibleShots([{
      id: "shot", label: "Front", presetKey: "front", azimuth: 0, elevation: 0,
      versions: [{
        outputId: "output", version: 1, mimeType: "image/jpeg", previewUrl: "/preview",
        downloadUrl: new URL(request.url).pathname, approvedAt: null, selectedAt: null,
        createdAt: "2026-10-07T00:00:00Z",
      }],
    }], {}, fetchFile);
    expect(fetchFile).toHaveBeenCalledWith(new URL(request.url).pathname, { cache: "no-store" });
    expect(unzipSync(archive!)).toEqual({ "front-v1-output.jpg": original });
  });

  it("does not read storage when the project belongs to another workspace", async () => {
    state.requireProject.mockRejectedValue(new ApiError(404, "project_not_found", "Project not found."));
    expect((await GET(request, context)).status).toBe(404);
    expect(state.condition).toBeNull();
    expect(state.getObjectStream).not.toHaveBeenCalled();
  });

  it("does not read storage for a missing output even when the project is owned", async () => {
    state.rows = [];
    expect((await GET(request, context)).status).toBe(404);
    expect(state.getObjectStream).not.toHaveBeenCalled();
  });
});
