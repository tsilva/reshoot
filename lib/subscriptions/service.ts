import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, type DatabaseTransaction } from "@/lib/db";
import { creditAccounts, creditLedger, subscriptions, subscriptionInvoices, users, type CreditAccountRecord } from "@/lib/db/schema";
import { ApiError } from "@/lib/api/errors";
import { MONTHLY_PLANS, monthlyPlan, TERMINAL_SUBSCRIPTION_STATUSES, type PlanSlug } from "./catalog";
import { portalConfigured, subscriptionsEnabled } from "./config";
import type { SubscriptionSummary } from "@/lib/api/types";

export async function expireMonthlyAllowance(tx: DatabaseTransaction, account: CreditAccountRecord, now = new Date()) {
  if (!account.monthlyPeriodEnd || account.monthlyPeriodEnd > now || !account.monthlyAvailableCredits) return account;
  const availableCredits = account.availableCredits - account.monthlyAvailableCredits;
  await tx.insert(creditLedger).values({
    accountId: account.id, userId: account.userId, type: "adjustment",
    sourceType: "subscription_expiry", sourceId: account.monthlyPeriodEnd.toISOString(),
    amountCredits: account.monthlyAvailableCredits, availableDelta: -account.monthlyAvailableCredits,
    heldDelta: 0, availableAfter: availableCredits, heldAfter: account.heldCredits,
    description: "Unused monthly allowance expired",
  });
  await tx.update(creditAccounts).set({ availableCredits, monthlyAvailableCredits: 0, updatedAt: now }).where(eq(creditAccounts.id, account.id));
  return { ...account, availableCredits, monthlyAvailableCredits: 0 };
}

export async function getSubscriptionSummary(userId: string, isDemo: boolean): Promise<SubscriptionSummary> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return {
    plans: MONTHLY_PLANS.map(plan => ({ ...plan })),
    current: row?.stripeSubscriptionId ? {
      planSlug: row.planSlug, status: row.status, cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      periodEnd: row.periodEnd?.toISOString() ?? null,
    } : null,
    checkoutAvailable: subscriptionsEnabled(isDemo),
    portalAvailable: portalConfigured(isDemo) && !!row?.stripeCustomerId,
    testMode: true,
  };
}

export type SubscriptionSnapshot = {
  userId: string; id: string; customerId: string; planSlug: PlanSlug;
  status: string; cancelAtPeriodEnd: boolean; periodEnd: Date; createdAt: Date;
};
export type PaidMonthlyInvoice = {
  id: string; subscriptionId: string; customerId: string; planSlug: PlanSlug;
  periodStart: Date; periodEnd: Date;
};

// The loader retrieves Stripe's current state INSIDE the account lock. Delayed
// or concurrent event deliveries therefore cannot restore an older snapshot.
export async function synchronizeSubscription(userId: string, load: () => Promise<SubscriptionSnapshot>, invoice?: PaidMonthlyInvoice) {
  return db.transaction(async tx => {
    await tx.execute(sql`select id from ${creditAccounts} where ${creditAccounts.userId} = ${userId}::uuid for update`);
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.isDemo) throw new ApiError(409, "test_account_required", "Test subscriptions require a test account.");
    const snapshot = await load();
    if (snapshot.userId !== userId) throw new ApiError(409, "subscription_owner_mismatch", "Subscription ownership could not be verified.");
    const [existing] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    if (existing?.stripeSubscriptionId && existing.stripeSubscriptionId !== snapshot.id) {
      // Never let an old subscription event replace its newer replacement.
      if (!TERMINAL_SUBSCRIPTION_STATUSES.includes(existing.status)
        || existing.stripeCreatedAt && existing.stripeCreatedAt >= snapshot.createdAt) return;
    }
    if (existing?.stripeCustomerId && existing.stripeCustomerId !== snapshot.customerId) {
      throw new ApiError(409, "subscription_customer_mismatch", "Subscription customer could not be verified.");
    }
    const values = {
      userId, stripeCustomerId: snapshot.customerId, stripeSubscriptionId: snapshot.id,
      stripeCreatedAt: snapshot.createdAt, planSlug: snapshot.planSlug, status: snapshot.status,
      periodEnd: snapshot.periodEnd, cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd, updatedAt: new Date(),
    };
    await tx.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.userId, set: values });
    if (!invoice) return;
    if (invoice.subscriptionId !== snapshot.id || invoice.customerId !== snapshot.customerId) throw new Error("Invoice subscription mismatch.");
    const plan = monthlyPlan(invoice.planSlug)!;
    const [receipt] = await tx.insert(subscriptionInvoices).values({
      stripeInvoiceId: invoice.id, userId, stripeSubscriptionId: snapshot.id,
      planSlug: plan.slug, credits: plan.credits, periodStart: invoice.periodStart, periodEnd: invoice.periodEnd,
    }).onConflictDoNothing().returning();
    if (!receipt) return;
    const [row] = await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1);
    if (!row) throw new Error("Credit account is missing.");
    const now = new Date();
    // Historical, duplicate and future invoices never refresh the current month.
    if (invoice.periodStart > now) throw new ApiError(409, "future_subscription_period", "The paid period has not started yet.");
    if (invoice.periodEnd <= now
      || row.monthlyPeriodStart && invoice.periodStart <= row.monthlyPeriodStart) return;
    const account = await expireMonthlyAllowance(tx, row, now);
    // Overlapping periods require operator review; never silently roll credits over.
    if (account.monthlyAvailableCredits > 0) {
      throw new ApiError(409, "overlapping_subscription_period", "The paid billing periods overlap.");
    }
    const availableAfter = account.availableCredits + plan.credits;
    await tx.insert(creditLedger).values({
      accountId: account.id, userId, type: "grant", sourceType: "subscription_invoice", sourceId: invoice.id,
      amountCredits: plan.credits, availableDelta: plan.credits, heldDelta: 0,
      availableAfter, heldAfter: account.heldCredits, description: `${plan.name} monthly allowance — Stripe test payment`,
    });
    await tx.update(creditAccounts).set({
      availableCredits: availableAfter, monthlyAvailableCredits: plan.credits,
      monthlyPeriodStart: invoice.periodStart, monthlyPeriodEnd: invoice.periodEnd,
      lifetimeGrantedCredits: account.lifetimeGrantedCredits + plan.credits, updatedAt: now,
    }).where(eq(creditAccounts.id, account.id));
  });
}
