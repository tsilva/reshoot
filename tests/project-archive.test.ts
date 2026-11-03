import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  projectDetail: vi.fn(),
  requireProject: vi.fn(),
  outputRows: vi.fn(),
  turntable: vi.fn(),
  render: vi.fn(),
  head: vi.fn(),
  read: vi.fn(),
  stream: vi.fn(),
  put: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => ({ where: state.outputRows }) }) },
}));
vi.mock("@/lib/projects/service", () => ({
  getProjectDetail: state.projectDetail,
  requireOwnedProject: state.requireProject,
}));
vi.mock("@/lib/projects/phone-turntable", () => ({ getPhoneTurntable: state.turntable }));
vi.mock("@/lib/generation/phone-turntable", () => ({ renderPhoneTurntable: state.render }));
vi.mock("@/lib/storage/r2", () => ({
  headObject: state.head,
  getObjectBuffer: state.read,
  getObjectStream: state.stream,
  putObject: state.put,
}));

import { GET, POST } from "../app/api/projects/[projectId]/download/route";
import { ApiError } from "../lib/api/errors";
import { prepareProjectArchive } from "../lib/projects/archive";

const request = new Request("https://reshoot.example/api/projects/project/download");
const context = { params: Promise.resolve({ projectId: "project" }) };
const viewsKey = "projects/project/exports/views-v1.zip";
const oldVersion = { outputId: "old", version: 1, mimeType: "image/png" };
const latest = { outputId: "latest", version: 2, mimeType: "image/jpeg" };
const shots = [
  { label: "Front", versions: [oldVersion, latest] },
  { label: "Right", versions: [] },
];
const missing = Object.assign(new Error("Missing"), { name: "NotFound" });

describe("stored project ZIPs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.projectDetail.mockResolvedValue({ shots, activeBatchId: null });
    state.requireProject.mockResolvedValue({ title: "Product Shoot" });
    state.head.mockRejectedValue(missing);
    state.outputRows.mockResolvedValue([{ id: "latest", key: "latest-key" }]);
    state.read.mockResolvedValue(Buffer.from("original"));
  });

  it("precomputes available final views and streams the same bytes on click", async () => {
    await expect(prepareProjectArchive("owner", "project")).resolves.toEqual({ turntable: false });
    const [{ key, body, mimeType }] = state.put.mock.calls[0];
    expect({ key, mimeType }).toEqual({ key: viewsKey, mimeType: "application/zip" });
    expect(unzipSync(body)).toEqual({ "front-v2-latest.jpg": new TextEncoder().encode("original") });
    expect(state.read.mock.calls).toEqual([["latest-key"]]);

    state.head.mockResolvedValue({});
    const ready = await POST(request, context);
    expect(await ready.json()).toEqual({ downloadUrl: "/api/projects/project/download" });
    expect(state.put).toHaveBeenCalledTimes(1);

    state.projectDetail.mockClear();
    state.stream.mockResolvedValue(new Response(body).body);
    const response = await GET(request, context);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="product-shoot-reshoot.zip"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
    expect(state.stream).toHaveBeenCalledWith(viewsKey);
    expect(state.projectDetail).not.toHaveBeenCalled();
    expect(state.read).toHaveBeenCalledTimes(1);
    expect(state.put).toHaveBeenCalledTimes(1);
  });

  it("prepares registered PNGs using the turntable renderer", async () => {
    state.projectDetail.mockResolvedValue({
      activeBatchId: null,
      registeredPhoneTurntable: true,
      shots: [{ label: "Front", versions: [{ ...latest, mimeType: "image/png" }] }],
    });
    state.turntable.mockResolvedValue(new Map([[0, { outputId: "latest", azimuth: 0, key: "face-key" }]]));
    state.render.mockImplementation(async (angle, load) => {
      expect(angle).toBe(0);
      await load(0);
      return Buffer.from("registered PNG");
    });

    const response = await POST(request, context);
    expect(await response.json()).toEqual({ downloadUrl: "/api/projects/project/download?turntable=1" });
    const [{ key, body }] = state.put.mock.calls[0];
    expect(key).toBe("projects/project/exports/turntable-v1.zip");
    expect(unzipSync(body)).toEqual({ "front-v2-latest.png": new TextEncoder().encode("registered PNG") });
    expect(state.read.mock.calls).toEqual([["face-key"]]);
  });

  it("does not publish an unfinished archive", async () => {
    state.projectDetail.mockResolvedValue({ shots, activeBatchId: "running" });
    expect((await POST(request, context)).status).toBe(409);
    expect(state.head).not.toHaveBeenCalled();
    expect(state.put).not.toHaveBeenCalled();
  });

  it("does not create a ZIP on a cache miss during download", async () => {
    state.stream.mockRejectedValue(missing);
    expect((await GET(request, context)).status).toBe(404);
    expect(state.put).not.toHaveBeenCalled();
    expect(state.read).not.toHaveBeenCalled();
  });

  it("checks ownership before streaming or preparing a ZIP", async () => {
    const denied = new ApiError(404, "project_not_found", "Project not found.");
    state.requireProject.mockRejectedValue(denied);
    state.projectDetail.mockRejectedValue(denied);
    expect((await GET(request, context)).status).toBe(404);
    expect((await POST(request, context)).status).toBe(404);
    expect(state.requireProject).toHaveBeenCalledWith("owner", "project");
    expect(state.projectDetail).toHaveBeenCalledWith("owner", "project");
    expect(state.stream).not.toHaveBeenCalled();
    expect(state.head).not.toHaveBeenCalled();
  });
});
