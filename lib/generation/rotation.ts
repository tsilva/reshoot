import { shotOrientation, type GenerationShot } from "./orientation";

export const ROTATION_POLICY = "verified-rotation-v2" as const;
export const ROTATION_REVIEW_MODEL = "openai/gpt-4.1-mini";
export const ANCHORED_ROTATION_REVIEW_MODEL = "openai/gpt-4.1";

export function targetSideImageEdge(azimuth: number) {
  if (azimuth % 90 === 0) return "neither";
  return azimuth < 90 || (azimuth > 180 && azimuth < 270) ? "right" : "left";
}

// Physical sides are named once from a straight-on front view, never renamed
// relative to the current image. This convention matches the guide renderer.
export function rotationTarget(shot: GenerationShot) {
  const orientation = shotOrientation(shot);
  if (!orientation) return undefined;
  const { azimuth } = orientation;
  const front = azimuth < 90 || azimuth > 270;
  const rear = azimuth > 90 && azimuth < 270;
  const side = azimuth > 0 && azimuth < 180 ? "right"
    : azimuth > 180 ? "left" : "neither";
  return { ...orientation, front, rear, side } as const;
}

export function rotationInstructions(shot: GenerationShot) {
  const target = rotationTarget(shot);
  if (!target) return "";
  return [
    "PHYSICAL COORDINATE FRAME — identical for the entire 360-degree set:",
    "Define FRONT consistently from the object's main presentation direction, independently of the upload's camera angle. If it has no identifiable front, use its primary-reference-facing direction as the canonical front. Physical RIGHT is image right in a straight-on front view; physical LEFT is the opposite side. Never swap these names when viewing the rear.",
    "The turn is 0 front → 45 front + right → 90 right ONLY → 135 rear + right → 180 rear → 225 rear + left → 270 left ONLY → 315 front + left → 0. The 270-degree view must expose the OPPOSITE physical side from 90; 315 must expose the OPPOSITE side from 45. Do not repeat or mirror those views.",
    `TARGET ${target.azimuth} degrees: front surface ${target.front ? "VISIBLE" : "HIDDEN"}; rear surface ${target.rear ? "VISIBLE" : "HIDDEN"}; visible physical side ${target.side.toUpperCase()}.`,
    "At a true profile, the front and rear broad surfaces are edge-on. Distinguish sides using actual asymmetric parts, controls, seams and attachments from the originals; never copy an asymmetry onto the opposite side.",
    "For curved, open or irregular objects, front/rear/side describe physical directions of the entire assembly, not a requirement for flat panels. Keep near/far occlusion and the relative positions of all components consistent. Genuinely symmetric surfaces may look alike; do not invent differences to distinguish them.",
  ].join("\n");
}
