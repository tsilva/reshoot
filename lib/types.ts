export type StudioStep =
  | "upload"
  | "angles"
  | "generating"
  | "review"
  | "export";

export type ShotStatus =
  | "queued"
  | "generating"
  | "ready"
  | "approved"
  | "rejected"
  | "error";

export type Angle = {
  id: string;
  label: string;
  azimuth: number;
  elevation: number;
};

export type Shot = {
  id: string;
  angle: Angle;
  imageUrl?: string;
  status: ShotStatus;
  reasons: string[];
  feedback: string;
  error?: string;
};

export type StudioState = {
  version: 1;
  step: StudioStep;
  original?: string;
  originalName?: string;
  angles: Angle[];
  shots: Shot[];
  savedAt?: number;
};

export const DEFAULT_ANGLES: Angle[] = [
  { id: "front", label: "Front", azimuth: 0, elevation: 0 },
  { id: "front-three-quarter", label: "3/4 Right", azimuth: 45, elevation: 4 },
  { id: "right-profile", label: "Right profile", azimuth: 90, elevation: 0 },
  { id: "back", label: "Back", azimuth: 180, elevation: 0 },
];

export function createInitialState(): StudioState {
  return {
    version: 1,
    step: "upload",
    angles: DEFAULT_ANGLES.map((angle) => ({ ...angle })),
    shots: [],
  };
}
