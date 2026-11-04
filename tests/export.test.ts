import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import type { ProjectShot, ShotVersion } from "../lib/api/types";
import { exportApprovedShots, exportVisibleShots } from "../lib/client/export";

const project = { id: "12345678-abcd-4000-8000-000000000000", title: "Product Shoot" };
const folder = "reshoot_product-shoot_12345678";

function shot(id: string, mimeType = "image/png", approved = true): ProjectShot {
  const version: ShotVersion = {
    outputId: `output-${id}`, version: 1, mimeType,
    previewUrl: "/preview", downloadUrl: `/api/projects/project/outputs/output-${id}/download`,
    approvedAt: approved ? "2026-10-07T00:00:00Z" : null,
    selectedAt: null, createdAt: "2026-10-07T00:00:00Z",
  };
  return { id, label: "Front", presetKey: "front", azimuth: 0, elevation: 0, versions: [version] };
}

describe("approved output export", () => {
  it("preserves perspective names and disambiguates collisions without overwriting another perspective", async () => {
    const fetchFile = vi.fn<typeof fetch>().mockImplementation(async (url) => new Response(String(url)));
    const shots = ["angle_N", "angle_N", "angle_N_2", "ANGLE_N", "../../"].map((label, index) => ({
      ...shot(String(index)), label,
    }));
    const archive = await exportApprovedShots(project, shots, fetchFile);
    const files = unzipSync(archive!);
    expect(Object.keys(files)).toEqual([
      `${folder}/angle_N.png`, `${folder}/angle_N_3.png`, `${folder}/angle_N_2.png`,
      `${folder}/ANGLE_N_4.png`, `${folder}/shot.png`,
    ]);
    expect(new TextDecoder().decode(files[`${folder}/angle_N_3.png`])).toContain("output-1/download");
  });

  it("keeps repeated preset versions and their real file formats", async () => {
    const fetchFile = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      new Response(String(url)),
    );
    const archive = await exportApprovedShots(project, [
      shot("one"), shot("two"), shot("three", "image/jpeg"), shot("four", "image/webp"), shot("unapproved", "image/png", false),
    ], fetchFile);
    const files = unzipSync(archive!);
    expect(Object.keys(files)).toEqual([
      `${folder}/Front.png`, `${folder}/Front_2.png`, `${folder}/Front.jpg`, `${folder}/Front.webp`,
    ]);
    expect(new TextDecoder().decode(files[`${folder}/Front_2.png`])).toContain("output-two/download");
    expect(fetchFile).toHaveBeenCalledTimes(4);
    expect(fetchFile).toHaveBeenCalledWith("/api/projects/project/outputs/output-one/download", { cache: "no-store" });
  });

  it.each([403, 404, 500])("rejects the entire export when a download returns %i", async (status) => {
    const fetchFile = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("first"))
      .mockResolvedValueOnce(new Response("unavailable", { status }));
    await expect(exportApprovedShots(project, [shot("one"), shot("two")], fetchFile)).rejects.toThrow("No ZIP was exported. Please retry.");
  });

  it("reports a network failure and does not silently produce a partial archive", async () => {
    const fetchFile = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Network failure"));
    await expect(exportApprovedShots(project, [shot("one")], fetchFile)).rejects.toThrow("Could not download Front.png");
  });

  it("does not download files for an empty approval set", async () => {
    const fetchFile = vi.fn<typeof fetch>();
    expect(await exportApprovedShots(project, [shot("one", "image/png", false)], fetchFile)).toBeNull();
    expect(fetchFile).not.toHaveBeenCalled();
  });
});

describe("canvas output export", () => {
  it("downloads the latest view without requiring or changing approval", async () => {
    const original = shot("one");
    const latest = { ...original.versions[0], outputId: "output-new", version: 2, approvedAt: null, downloadUrl: "/new" };
    original.versions.push(latest);
    const before = structuredClone(original);
    const fetchFile = vi.fn<typeof fetch>().mockResolvedValue(new Response("latest"));
    const archive = await exportVisibleShots(project, [original], {}, fetchFile);
    expect(Object.keys(unzipSync(archive!))).toEqual([`${folder}/Front.png`]);
    expect(fetchFile).toHaveBeenCalledWith("/new", { cache: "no-store" });
    expect(original).toEqual(before);
  });

  it("exports the historical version being viewed and skips unfinished shots", async () => {
    const original = shot("one", "image/jpeg", false);
    original.versions.push({ ...original.versions[0], outputId: "output-new", version: 2 });
    const fetchFile = vi.fn<typeof fetch>().mockResolvedValue(new Response("older"));
    const archive = await exportVisibleShots(project, [original, { ...shot("pending"), versions: [] }], { one: "output-one" }, fetchFile);
    expect(Object.keys(unzipSync(archive!))).toEqual([`${folder}/Front.jpg`]);
    expect(fetchFile).toHaveBeenCalledTimes(1);
  });

  it("does not produce a partial canvas export on failure", async () => {
    const fetchFile = vi.fn<typeof fetch>().mockResolvedValue(new Response("unavailable", { status: 403 }));
    await expect(exportVisibleShots(project, [shot("one")], {}, fetchFile)).rejects.toThrow("No ZIP was exported");
  });
});
