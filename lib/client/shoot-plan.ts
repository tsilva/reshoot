import type { Asset } from "@/lib/api/types";
import { MAX_GENERATION_REFERENCES } from "@/lib/projects/limits";

// Keep the existing four-view generation budget; the studio chooses the views.
export const STUDIO_VIEWS = [
  { id: "front", label: "Front", azimuth: 0, elevation: 0 },
  { id: "front-three-quarter", label: "3/4 right", azimuth: 45, elevation: 0 },
  { id: "right-profile", label: "Right profile", azimuth: 90, elevation: 0 },
  { id: "back", label: "Back", azimuth: 180, elevation: 0 },
] as const;

export function shootReferences(assets: Asset[]) {
  const originals = assets
    .filter((asset) => asset.kind === "original" && asset.status === "ready")
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const primary = originals.find((asset) => asset.isPrimary);
  if (!primary) return [];
  return [primary, ...originals.filter((asset) => asset.id !== primary.id)]
    .slice(0, MAX_GENERATION_REFERENCES);
}

export function automaticShotRequests(assets: Asset[]) {
  const references = shootReferences(assets);
  if (!references.length) return [];
  return STUDIO_VIEWS.map((view) => ({
    clientId: view.id,
    label: view.label,
    presetKey: view.id,
    azimuth: view.azimuth,
    elevation: view.elevation,
    additionalReferenceAssetIds: references.slice(1).map((asset) => asset.id),
  }));
}
