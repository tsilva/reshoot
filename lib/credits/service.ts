import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import type { CreditLedgerEntry, CreditSummary } from "@/lib/api/types";
import { demoCheckoutEnabledForEnvironment } from "@/lib/credits/policy";
import { db } from "@/lib/db";
import {
  creditAccounts,
  creditLedger,
  creditPacks,
  priceBands,
  priceVersions,
  testPurchases,
} from "@/lib/db/schema";

export function demoCheckoutEnabled(isDemoUser: boolean) {
  return demoCheckoutEnabledForEnvironment({
    isDemoUser,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
}

export async function getCreditSummary(
  userId: string,
  isDemoUser: boolean,
): Promise<CreditSummary> {
  const [account, packs, bands] = await Promise.all([
    db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId))
      .limit(1),
    db
      .select()
      .from(creditPacks)
      .where(eq(creditPacks.active, true))
      .orderBy(asc(creditPacks.sortOrder)),
    db
      .select({ credits: priceBands.creditsPerShot })
      .from(priceBands)
      .innerJoin(priceVersions, eq(priceVersions.id, priceBands.priceVersionId))
      .where(eq(priceVersions.active, true)),
  ]);

  const row = account[0];
  if (!row) throw new Error("Credit account is not seeded.");
  const bandValues = bands.map((band) => band.credits);
  const minBand = Math.min(...bandValues);
  const maxBand = Math.max(...bandValues);

  return {
    availableCredits: row.availableCredits,
    heldCredits: row.heldCredits,
    purchaseValueUsd: row.availableCredits / 100,
    estimatedShots: {
      min: Math.floor(row.availableCredits / maxBand),
      max: Math.floor(row.availableCredits / minBand),
    },
    creditsPerUsd: 100,
    packs: packs.map((pack) => ({
      slug: pack.slug,
      name: pack.name,
      credits: pack.credits,
      usd: pack.usdMicros / 1_000_000,
      recommended: pack.slug === "studio",
    })),
    demoCheckoutAvailable: demoCheckoutEnabled(isDemoUser),
  };
}

export async function getCreditActivity(
  userId: string,
  limit = 100,
): Promise<CreditLedgerEntry[]> {
  const rows = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return rows.map((entry) => ({
    id: entry.id,
    type: entry.type,
    amountCredits: entry.amountCredits,
    availableAfter: entry.availableAfter,
    heldAfter: entry.heldAfter,
    description: entry.description,
    createdAt: entry.createdAt.toISOString(),
  }));
}

export async function createDemoPurchase(input: {
  userId: string;
  isDemoUser: boolean;
  packSlug: string;
  idempotencyKey: string;
}) {
  if (!demoCheckoutEnabled(input.isDemoUser)) {
    throw new ApiError(
      503,
      "checkout_unavailable",
      "Credit checkout is not available in this environment.",
    );
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${creditAccounts} where ${creditAccounts.userId} = ${input.userId}::uuid for update`,
    );

    const [existing] = await tx
      .select()
      .from(testPurchases)
      .where(
        and(
          eq(testPurchases.userId, input.userId),
          eq(testPurchases.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [pack] = await tx
      .select()
      .from(creditPacks)
      .where(
        and(eq(creditPacks.slug, input.packSlug), eq(creditPacks.active, true)),
      )
      .limit(1);
    if (!pack) {
      throw new ApiError(400, "invalid_pack", "Choose an available credit pack.");
    }

    const [account] = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, input.userId))
      .limit(1);
    if (!account) throw new Error("Credit account is not seeded.");

    const [purchase] = await tx
      .insert(testPurchases)
      .values({
        userId: input.userId,
        packId: pack.id,
        idempotencyKey: input.idempotencyKey,
        credits: pack.credits,
        usdMicros: pack.usdMicros,
      })
      .returning();
    const availableAfter = account.availableCredits + pack.credits;
    const [entry] = await tx
      .insert(creditLedger)
      .values({
        accountId: account.id,
        userId: input.userId,
        type: "grant",
        sourceType: "test_purchase",
        sourceId: purchase.id,
        amountCredits: pack.credits,
        availableDelta: pack.credits,
        heldDelta: 0,
        availableAfter,
        heldAfter: account.heldCredits,
        description: `${pack.name} pack — no-charge test checkout`,
      })
      .returning();
    await tx
      .update(creditAccounts)
      .set({
        availableCredits: availableAfter,
        lifetimeGrantedCredits: account.lifetimeGrantedCredits + pack.credits,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, account.id));
    await tx
      .update(testPurchases)
      .set({ ledgerEntryId: entry.id })
      .where(eq(testPurchases.id, purchase.id));

    return { ...purchase, ledgerEntryId: entry.id };
  });
}
