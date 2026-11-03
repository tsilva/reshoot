import { describe, expect, it } from "vitest";
import type { Asset } from "@/lib/api/types";
import { automaticShotRequests, shootReferences } from "@/lib/client/shoot-plan";

function original(id: number, patch: Partial<Asset> = {}): Asset {
  return {
    id: String(id), kind: "original", status: "ready", filename: `${id}.jpg`,
    mimeType: "image/jpeg", sizeBytes: 100, width: 100, height: 100,
    isPrimary: id === 1, previewUrl: null, originalUrl: null,
    createdAt: `2026-11-02T10:00:${String(id).padStart(2, "0")}Z`, ...patch,
  };
}

describe("automatic shoot plan", () => {
  it("creates a full rotation from a single original without user selections", () => {
    const requests = automaticShotRequests([original(1)]);
    expect(requests.map((shot) => [shot.azimuth, shot.presetKey])).toEqual([
      [0, "front"], [45, "front-three-quarter"], [90, "right-profile"],
      [135, "back-right-three-quarter"], [180, "back"], [225, "back-left-three-quarter"],
      [270, "left-profile"], [315, "front-left-three-quarter"],
    ]);
    expect(requests.every((shot) => shot.elevation === 0 && !shot.additionalReferenceAssetIds.length)).toBe(true);
  });

  it("includes every supporting original automatically up to the five-reference limit", () => {
    const assets = [original(3), original(1), original(2), original(4), original(5)];
    expect(automaticShotRequests(assets).map((shot) => shot.additionalReferenceAssetIds)).toEqual(
      Array.from({ length: 8 }, () => ["2", "3", "4", "5"]),
    );
  });

  it("preserves a saved primary and caps references in stable upload order", () => {
    const assets = Array.from({ length: 25 }, (_, index) => original(index + 1, { isPrimary: index === 20 }));
    expect(shootReferences(assets.toReversed()).map((asset) => asset.id)).toEqual(["21", "1", "2", "3", "4"]);
    expect(assets).toHaveLength(25);
  });

  it("excludes failed, pending, and generated files from paid requests", () => {
    const assets = [original(1), original(2, { status: "failed" }), original(3, { status: "pending" }), original(4, { kind: "generated" }), original(5)];
    expect(automaticShotRequests(assets)[0].additionalReferenceAssetIds).toEqual(["5"]);
  });

  it("cannot plan generation without a ready original anchor", () => {
    expect(automaticShotRequests([])).toEqual([]);
    expect(automaticShotRequests([original(2)])).toEqual([]);
    expect(automaticShotRequests([original(1, { status: "processing" })])).toEqual([]);
    expect(automaticShotRequests([original(1, { kind: "generated" })])).toEqual([]);
  });
});
