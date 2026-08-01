import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const projectStatus = pgEnum("project_status", [
  "draft",
  "ready",
  "generating",
  "archived",
  "deleted",
]);
export const assetKind = pgEnum("asset_kind", ["original", "generated"]);
export const assetStatus = pgEnum("asset_status", [
  "pending",
  "uploaded",
  "processing",
  "ready",
  "failed",
  "deleted",
]);
export const assetVariantKind = pgEnum("asset_variant_kind", [
  "preview",
  "generation_reference",
]);
export const batchStatus = pgEnum("batch_status", [
  "held",
  "queued",
  "running",
  "partial",
  "succeeded",
  "failed",
]);
export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);
export const attemptStatus = pgEnum("attempt_status", [
  "claimed",
  "started",
  "succeeded",
  "failed",
  "ambiguous",
]);
export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "dispatching",
  "dispatched",
  "reconcile",
  "failed",
]);
export const creditHoldStatus = pgEnum("credit_hold_status", [
  "held",
  "partial",
  "captured",
  "released",
]);
export const creditLedgerType = pgEnum("credit_ledger_type", [
  "grant",
  "hold",
  "capture",
  "release",
  "adjustment",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    legacyImportCompletedAt: timestamp("legacy_import_completed_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    status: projectStatus("status").default("draft").notNull(),
    primaryAssetId: uuid("primary_asset_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("projects_owner_updated_idx").on(table.ownerId, table.updatedAt),
    check("projects_title_not_blank", sql`length(trim(${table.title})) > 0`),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    kind: assetKind("kind").default("original").notNull(),
    status: assetStatus("status").default("pending").notNull(),
    originalFilename: text("original_filename").notNull(),
    r2Key: text("r2_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    retainedUntil: timestamp("retained_until", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("assets_r2_key_unique").on(table.r2Key),
    index("assets_project_status_idx").on(table.projectId, table.status),
    check("assets_size_nonnegative", sql`${table.sizeBytes} >= 0`),
  ],
);

export const assetVariants = pgTable(
  "asset_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: assetVariantKind("kind").notNull(),
    r2Key: text("r2_key").notNull(),
    mimeType: text("mime_type").default("image/webp").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("asset_variants_asset_kind_unique").on(
      table.assetId,
      table.kind,
    ),
    uniqueIndex("asset_variants_r2_key_unique").on(table.r2Key),
  ],
);

export const shots = pgTable(
  "shots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    presetKey: text("preset_key"),
    prompt: text("prompt"),
    azimuth: integer("azimuth"),
    elevation: integer("elevation"),
    ...timestamps,
  },
  (table) => [index("shots_project_created_idx").on(table.projectId, table.createdAt)],
);

export const priceVersions = pgTable(
  "price_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    label: text("label").notNull(),
    outputCostMicros: integer("output_cost_micros").notNull(),
    textAllowanceMicros: integer("text_allowance_micros").notNull(),
    referenceAllowanceMicros: integer("reference_allowance_micros").notNull(),
    providerFundingBps: integer("provider_funding_bps").notNull(),
    failureReserveBps: integer("failure_reserve_bps").notNull(),
    grossMarginBps: integer("gross_margin_bps").notNull(),
    creditsPerUsd: integer("credits_per_usd").default(100).notNull(),
    active: boolean("active").default(false).notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("price_versions_label_unique").on(table.label)],
);

export const priceBands = pgTable(
  "price_bands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    priceVersionId: uuid("price_version_id")
      .notNull()
      .references(() => priceVersions.id, { onDelete: "restrict" }),
    referenceCount: integer("reference_count").notNull(),
    creditsPerShot: integer("credits_per_shot").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("price_bands_version_references_unique").on(
      table.priceVersionId,
      table.referenceCount,
    ),
    check(
      "price_bands_reference_range",
      sql`${table.referenceCount} between 1 and 5`,
    ),
    check("price_bands_credits_positive", sql`${table.creditsPerShot} > 0`),
  ],
);

export type QuoteShotInput = {
  clientId: string;
  shotId?: string;
  label: string;
  presetKey?: string;
  prompt?: string;
  azimuth?: number;
  elevation?: number;
  referenceAssetIds: string[];
};

export const generationQuotes = pgTable(
  "generation_quotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    priceVersionId: uuid("price_version_id")
      .notNull()
      .references(() => priceVersions.id, { onDelete: "restrict" }),
    shots: jsonb("shots").$type<QuoteShotInput[]>().notNull(),
    totalCredits: integer("total_credits").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBatchId: uuid("used_batch_id"),
    ...timestamps,
  },
  (table) => [
    index("generation_quotes_owner_expiry_idx").on(
      table.ownerId,
      table.expiresAt,
    ),
    check("generation_quotes_total_positive", sql`${table.totalCredits} > 0`),
  ],
);

export const generationBatches = pgTable(
  "generation_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => generationQuotes.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: batchStatus("status").default("held").notNull(),
    totalCredits: integer("total_credits").notNull(),
    completedJobs: integer("completed_jobs").default(0).notNull(),
    failedJobs: integer("failed_jobs").default(0).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("generation_batches_owner_idempotency_unique").on(
      table.ownerId,
      table.idempotencyKey,
    ),
    uniqueIndex("generation_batches_quote_unique").on(table.quoteId),
    index("generation_batches_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => generationBatches.id, { onDelete: "restrict" }),
    shotId: uuid("shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "restrict" }),
    status: jobStatus("status").default("queued").notNull(),
    version: integer("version").notNull(),
    referenceCount: integer("reference_count").notNull(),
    quotedCredits: integer("quoted_credits").notNull(),
    workflowRunId: text("workflow_run_id"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    publicError: text("public_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("generation_jobs_shot_version_unique").on(
      table.shotId,
      table.version,
    ),
    index("generation_jobs_owner_status_idx").on(table.ownerId, table.status),
    check(
      "generation_jobs_reference_range",
      sql`${table.referenceCount} between 1 and 5`,
    ),
  ],
);

export const generationInputs = pgTable(
  "generation_inputs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    role: text("role").notNull(),
    frozenR2Key: text("frozen_r2_key").notNull(),
    frozenChecksumSha256: text("frozen_checksum_sha256").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("generation_inputs_job_ordinal_unique").on(
      table.jobId,
      table.ordinal,
    ),
  ],
);

export const generationAttempts = pgTable(
  "generation_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    state: attemptStatus("state").default("claimed").notNull(),
    providerRequestId: text("provider_request_id"),
    providerModel: text("provider_model"),
    providerEndpoint: text("provider_endpoint"),
    usageCostMicros: integer("usage_cost_micros"),
    outputR2Key: text("output_r2_key").notNull(),
    previewR2Key: text("preview_r2_key").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    ambiguousAt: timestamp("ambiguous_at", { withTimezone: true }),
    privateError: text("private_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("generation_attempts_job_number_unique").on(
      table.jobId,
      table.attemptNumber,
    ),
    uniqueIndex("generation_attempts_output_key_unique").on(table.outputR2Key),
  ],
);

export const generationOutputs = pgTable(
  "generation_outputs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    jobId: uuid("job_id").references(() => generationJobs.id, {
      onDelete: "restrict",
    }),
    attemptId: uuid("attempt_id").references(() => generationAttempts.id, {
      onDelete: "restrict",
    }),
    shotId: uuid("shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    r2Key: text("r2_key").notNull(),
    previewR2Key: text("preview_r2_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    selectedAt: timestamp("selected_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("generation_outputs_job_unique")
      .on(table.jobId)
      .where(sql`${table.jobId} is not null`),
    uniqueIndex("generation_outputs_r2_key_unique").on(table.r2Key),
    uniqueIndex("generation_outputs_shot_version_unique").on(
      table.shotId,
      table.version,
    ),
  ],
);

export const workflowOutbox = pgTable(
  "workflow_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "restrict" }),
    status: outboxStatus("status").default("pending").notNull(),
    workflowRunId: text("workflow_run_id"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    dispatchAttempts: integer("dispatch_attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastError: text("last_error"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workflow_outbox_job_unique").on(table.jobId),
    index("workflow_outbox_dispatch_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
  ],
);

export const creditAccounts = pgTable(
  "credit_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    availableCredits: integer("available_credits").default(0).notNull(),
    heldCredits: integer("held_credits").default(0).notNull(),
    lifetimeGrantedCredits: integer("lifetime_granted_credits")
      .default(0)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("credit_accounts_user_unique").on(table.userId),
    check(
      "credit_accounts_available_nonnegative",
      sql`${table.availableCredits} >= 0`,
    ),
    check(
      "credit_accounts_held_nonnegative",
      sql`${table.heldCredits} >= 0`,
    ),
  ],
);

export const creditHolds = pgTable(
  "credit_holds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => creditAccounts.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => generationBatches.id, { onDelete: "restrict" }),
    status: creditHoldStatus("status").default("held").notNull(),
    originalCredits: integer("original_credits").notNull(),
    remainingCredits: integer("remaining_credits").notNull(),
    capturedCredits: integer("captured_credits").default(0).notNull(),
    releasedCredits: integer("released_credits").default(0).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("credit_holds_batch_unique").on(table.batchId),
    check("credit_holds_original_positive", sql`${table.originalCredits} > 0`),
    check(
      "credit_holds_remaining_nonnegative",
      sql`${table.remainingCredits} >= 0`,
    ),
  ],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => creditAccounts.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: creditLedgerType("type").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    amountCredits: integer("amount_credits").notNull(),
    availableDelta: integer("available_delta").notNull(),
    heldDelta: integer("held_delta").notNull(),
    availableAfter: integer("available_after").notNull(),
    heldAfter: integer("held_after").notNull(),
    description: text("description").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("credit_ledger_source_unique").on(
      table.userId,
      table.type,
      table.sourceType,
      table.sourceId,
    ),
    index("credit_ledger_user_created_idx").on(table.userId, table.createdAt),
    check("credit_ledger_amount_positive", sql`${table.amountCredits} > 0`),
    check(
      "credit_ledger_balances_nonnegative",
      sql`${table.availableAfter} >= 0 and ${table.heldAfter} >= 0`,
    ),
  ],
);

export const creditPacks = pgTable(
  "credit_packs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    credits: integer("credits").notNull(),
    usdMicros: integer("usd_micros").notNull(),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("credit_packs_slug_unique").on(table.slug),
    check("credit_packs_credits_positive", sql`${table.credits} > 0`),
    check("credit_packs_usd_positive", sql`${table.usdMicros} > 0`),
  ],
);

export const testPurchases = pgTable(
  "test_purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    packId: uuid("pack_id")
      .notNull()
      .references(() => creditPacks.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    credits: integer("credits").notNull(),
    usdMicros: integer("usd_micros").notNull(),
    ledgerEntryId: uuid("ledger_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("test_purchases_user_idempotency_unique").on(
      table.userId,
      table.idempotencyKey,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type AssetRecord = typeof assets.$inferSelect;
export type GenerationQuoteRecord = typeof generationQuotes.$inferSelect;
export type GenerationBatchRecord = typeof generationBatches.$inferSelect;
export type CreditAccountRecord = typeof creditAccounts.$inferSelect;
