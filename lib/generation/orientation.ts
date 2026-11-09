export type GenerationShot = {
  label: string;
  presetKey?: string | null;
  azimuth?: number | null;
  elevation?: number | null;
  prompt?: string | null;
};

const presetAzimuths = new Map([
  ["front", 0], ["front-three-quarter", 45], ["right-profile", 90],
  ["back-right-three-quarter", 135], ["back", 180],
  ["back-left-three-quarter", 225], ["left-profile", 270],
  ["front-left-three-quarter", 315],
]);

export function shotOrientation(shot: GenerationShot) {
  const azimuth = shot.azimuth ?? (shot.presetKey ? presetAzimuths.get(shot.presetKey) : undefined);
  const elevation = shot.elevation ?? 0;
  if (!Number.isFinite(elevation) || Math.abs(elevation) > 90 || (azimuth != null && !Number.isFinite(azimuth))) {
    throw new RangeError("Invalid shot orientation.");
  }
  if (azimuth == null) return undefined;
  return { azimuth: ((azimuth % 360) + 360) % 360, elevation };
}
