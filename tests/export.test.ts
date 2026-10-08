import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import type { ProjectShot, ShotVersion } from "../lib/api/types";
import { exportApprovedShots } from "../lib/client/export";

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
  it("keeps repeated preset versions and their real file formats", async () => {
    const fetchFile = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      new Response(String(url)),
    );
    const archive = await exportApprovedShots([
      shot("one"), shot("two"), shot("three", "image/jpeg"), shot("four", "image/webp"), shot("unapproved", "image/png", false),
    ], fetchFile);
    const files = unzipSync(archive!);
    expect(Object.keys(files)).toEqual([
      "front-v1-output-one.png", "front-v1-output-two.png", "front-v1-output-three.jpg", "front-v1-output-four.webp",
    ]);
    expect(new TextDecoder().decode(files["front-v1-output-two.png"])).toContain("output-two/download");
    expect(fetchFile).toHaveBeenCalledTimes(4);
    expect(fetchFile).toHaveBeenCalledWith("/api/projects/project/outputs/output-one/download", { cache: "no-store" });
  });

  it.each([403, 404, 500])("rejects the entire export when a download returns %i", async (status) => {
    const fetchFile = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("first"))
      .mockResolvedValueOnce(new Response("unavailable", { status }));
    await expect(exportApprovedShots([shot("one"), shot("two")], fetchFile)).rejects.toThrow("No ZIP was exported. Please retry.");
  });

  it("reports a network failure and does not silently produce a partial archive", async () => {
    const fetchFile = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Network failure"));
    await expect(exportApprovedShots([shot("one")], fetchFile)).rejects.toThrow("Could not download front-v1-output-one.png");
  });

  it("does not download files for an empty approval set", async () => {
    const fetchFile = vi.fn<typeof fetch>();
    expect(await exportApprovedShots([shot("one", "image/png", false)], fetchFile)).toBeNull();
    expect(fetchFile).not.toHaveBeenCalled();
  });
});
