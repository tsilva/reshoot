export type Asset = {
  id: string;
  kind: "original" | "generated";
  status: "pending" | "uploaded" | "processing" | "ready" | "failed";
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  previewUrl: string | null;
  originalUrl: string | null;
  createdAt: string;
};

export type ProjectSummary = {
  id: string;
  title: string;
  status: "draft" | "ready" | "generating" | "archived";
  originalCount: number;
  generatedCount: number;
  primaryPreviewUrl: string | null;
  updatedAt: string;
};

export type ShotVersion = {
  outputId: string;
  version: number;
  previewUrl: string;
  downloadUrl: string;
  approvedAt: string | null;
  selectedAt: string | null;
  createdAt: string;
};

export type ProjectShot = {
  id: string;
  label: string;
  presetKey: string | null;
  azimuth: number | null;
  elevation: number | null;
  versions: ShotVersion[];
};

export type ProjectDetail = ProjectSummary & {
  assets: Asset[];
  shots: ProjectShot[];
  activeBatchId: string | null;
};

export type GenerationQuote = {
  id: string;
  expiresAt: string;
  totalCredits: number;
  availableCredits: number;
  affordable: boolean;
  shots: Array<{
    clientId: string;
    referenceCount: number;
    credits: number;
  }>;
};

export type GenerationBatchStatus = {
  id: string;
  projectId: string;
  status: "held" | "queued" | "running" | "partial" | "succeeded" | "failed";
  totalCredits: number;
  completedJobs: number;
  failedJobs: number;
  jobs: Array<{
    id: string;
    shotId: string;
    status: "queued" | "running" | "succeeded" | "failed";
    version: number;
    quotedCredits: number;
    publicError: string | null;
    output: ShotVersion | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type CreditSummary = {
  availableCredits: number;
  heldCredits: number;
  purchaseValueUsd: number;
  estimatedShots: { min: number; max: number };
  creditsPerUsd: 100;
  packs: Array<{
    slug: string;
    name: string;
    credits: number;
    usd: number;
    recommended: boolean;
  }>;
  demoCheckoutAvailable: boolean;
};

export type CreditLedgerEntry = {
  id: string;
  type: "grant" | "hold" | "capture" | "release" | "adjustment";
  amountCredits: number;
  availableAfter: number;
  heldAfter: number;
  description: string;
  createdAt: string;
};
