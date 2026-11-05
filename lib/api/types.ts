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
  activeBatchId?: string | null;
};

export type ShotVersion = {
  outputId: string;
  version: number;
  mimeType: string;
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
  registeredPhoneTurntable?: boolean;
  turntableUnavailable?: boolean;
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
  subscription?: SubscriptionSummary;
  monthlyAvailableCredits?: number;
  monthlyPeriodEnd?: string | null;
  availableCredits: number;
  heldCredits: number;
  estimatedShots: { min: number; max: number };

};

export type CreditLedgerEntry = {
  availableDelta?: number;
  id: string;
  type: "grant" | "hold" | "capture" | "release" | "adjustment";
  amountCredits: number;
  availableAfter: number;
  heldAfter: number;
  description: string;
  createdAt: string;
};

export type SubscriptionSummary = {
  plans: Array<{ slug: "starter" | "studio" | "pro"; name: string; description: string; usd: number; credits: number; badge: string | null }>;
  current: { planSlug: string | null; status: string; cancelAtPeriodEnd: boolean; periodEnd: string | null } | null;
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  testMode: boolean;
};
