import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import type { CreditLedgerEntry, CreditSummary } from "@/lib/api/types";
import { stripeTestCheckoutEnabled } from "@/lib/payments/config";
import type { StripeTestReceipt } from "@/lib/payments/receipt";
import { db } from "@/lib/db";
import { expireMonthlyAllowance, getSubscriptionSummary } from "@/lib/subscriptions/service";
import {
  creditAccounts,
  creditLedger,
  creditPacks,
  priceBands,
  priceVersions,
  testPurchases,
  users,
} from "@/lib/db/schema";

export async function getCreditSummary(
  userId: string,
  isDemoUser: boolean,
): Promise<CreditSummary> {
  const [row, bands, subscription] = await Promise.all([
    db.transaction(async tx => {
      await tx.execute(sql`select id from ${creditAccounts} where ${creditAccounts.userId} = ${userId}::uuid for update`);
      const [account] = await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1);
      if (!account) throw new Error("Credit account is not seeded.");
      return expireMonthlyAllowance(tx, account);
    }),
    db
      .select({ credits: priceBands.creditsPerShot })
      .from(priceBands)
      .innerJoin(priceVersions, eq(priceVersions.id, priceBands.priceVersionId))
      .where(eq(priceVersions.active, true)),
    getSubscriptionSummary(userId, isDemoUser),
  ]);
  if (!row) throw new Error("Credit account is not seeded.");
  const bandValues = bands.map((band) => band.credits);
  const minBand = Math.min(...bandValues);
  const maxBand = Math.max(...bandValues);

  return {
    subscription,
    monthlyAvailableCredits: row.monthlyAvailableCredits,
    monthlyPeriodEnd: row.monthlyPeriodEnd?.toISOString() ?? null,
    availableCredits: row.availableCredits,
    heldCredits: row.heldCredits,
    estimatedShots: {
      min: Math.floor(row.availableCredits / maxBand),
      max: Math.floor(row.availableCredits / minBand),
    },

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
    availableDelta: entry.availableDelta,
    availableAfter: entry.availableAfter,
    heldAfter: entry.heldAfter,
    description: entry.description,
    createdAt: entry.createdAt.toISOString(),
  }));
}

export async function getCheckoutPack(userId: string, isDemoUser: boolean, slug: string) {
  if (!stripeTestCheckoutEnabled(isDemoUser)) {
    throw new ApiError(503, "checkout_unavailable", "Stripe test checkout is unavailable.");
  }
  const [account, pack] = await Promise.all([
    db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1),
    db.select().from(creditPacks).where(and(eq(creditPacks.slug, slug), eq(creditPacks.active, true))).limit(1),
  ]);
  if (!account[0]) throw new ApiError(409, "wallet_unavailable", "Your credit account is unavailable.");
  if (!pack[0]) throw new ApiError(400, "invalid_pack", "Choose an available credit pack.");
  return pack[0];
}

export async function findStripeTestPurchase(userId: string, sessionId: string) {
  const [purchase] = await db.select().from(testPurchases)
    .where(and(eq(testPurchases.userId, userId), eq(testPurchases.idempotencyKey, `stripe:${sessionId}`))).limit(1);
  return purchase;
}

// Only the verified Stripe webhook calls this with a retrieved, paid test receipt.
export async function grantStripeTestCredits(input: StripeTestReceipt) {
  if (!stripeTestCheckoutEnabled(true)) throw new ApiError(503, "checkout_unavailable", "Stripe test checkout is unavailable.");
  const idempotencyKey = `stripe:${input.sessionId}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${creditAccounts} where ${creditAccounts.userId} = ${input.userId}::uuid for update`);
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user?.isDemo) throw new ApiError(409, "test_account_required", "Test checkout cannot credit this account.");
    const [existing] = await tx.select().from(testPurchases)
      .where(and(eq(testPurchases.userId, input.userId), eq(testPurchases.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) {
      if (existing.packId !== input.packId || existing.credits !== input.credits || existing.usdMicros !== input.usdMicros) {
        throw new ApiError(409, "checkout_conflict", "This checkout has already been recorded with different details.");
      }
      return existing;
    }
    const [pack] = await tx.select().from(creditPacks).where(eq(creditPacks.id, input.packId)).limit(1);
    if (!pack || pack.slug !== input.packSlug) throw new ApiError(400, "invalid_pack", "The purchased credit pack is unavailable.");
    const [account] = await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1);
    if (!account) throw new Error("Credit account is not seeded.");
    // Preserve the server-created Stripe price/credit snapshot even if the catalog changes later.
    const [purchase] = await tx.insert(testPurchases).values({
      userId: input.userId, packId: input.packId, idempotencyKey,
      credits: input.credits, usdMicros: input.usdMicros,
    }).returning();
    const availableAfter = account.availableCredits + input.credits;
    const [entry] = await tx.insert(creditLedger).values({
      accountId: account.id, userId: input.userId, type: "grant",
      sourceType: "stripe_test_checkout", sourceId: input.sessionId,
      amountCredits: input.credits, availableDelta: input.credits, heldDelta: 0,
      availableAfter, heldAfter: account.heldCredits,
      description: `${pack.name} pack — Stripe test payment`,
      metadata: { stripeSessionId: input.sessionId, livemode: false },
    }).returning();
    await tx.update(creditAccounts).set({
      availableCredits: availableAfter,
      lifetimeGrantedCredits: account.lifetimeGrantedCredits + input.credits,
      updatedAt: new Date(),
    }).where(eq(creditAccounts.id, account.id));
    await tx.update(testPurchases).set({ ledgerEntryId: entry.id }).where(eq(testPurchases.id, purchase.id));
    return { ...purchase, ledgerEntryId: entry.id };
  });
}
