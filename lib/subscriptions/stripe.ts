import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { creditAccounts, subscriptions, subscriptionInvoices } from "@/lib/db/schema";
import { stripeClient, stripeRequest } from "@/lib/payments/stripe";
import { monthlyPlan, MONTHLY_PLANS, SUBSCRIPTION_APPLICATION, TERMINAL_SUBSCRIPTION_STATUSES, type PlanSlug } from "./catalog";
import { monthlyCatalogEnabled, monthlyPriceId, portalConfigured, subscriptionsEnabled } from "./config";
import { synchronizeSubscription, type PaidMonthlyInvoice, type SubscriptionSnapshot } from "./service";

function unavailable(): never { throw new ApiError(503, "subscriptions_unavailable", "Monthly subscriptions are not available yet. No payment was started."); }
function requireEnabled(isDemo: boolean) { if (!subscriptionsEnabled(isDemo)) unavailable(); }
function referenceId(value: string | { id: string } | null | undefined) { return typeof value === "string" ? value : value?.id; }
function checkoutUrl(value: string | null) {
  if (!value) throw new Error("Missing Stripe checkout URL.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password) throw new Error("Invalid Stripe checkout URL.");
  return url.href;
}
function planForPrice(price: Stripe.Price) {
  const plan = MONTHLY_PLANS.find(plan => monthlyPriceId(plan.slug) === price.id);
  if (!plan || price.livemode || price.currency !== "usd" || price.unit_amount !== plan.usd * 100
    || price.type !== "recurring" || price.recurring?.interval !== "month"
    || price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed") {
    throw new ApiError(409, "invalid_monthly_price", "This monthly plan is not configured correctly.");
  }
  return plan;
}

async function requirePortalConfiguration() {
  const configuration = process.env.STRIPE_TEST_PORTAL_CONFIGURATION_ID;
  if (!/^bpc_[a-zA-Z0-9]+$/.test(configuration ?? "")) unavailable();
  const config = await stripeRequest(() => stripeClient().billingPortal.configurations.retrieve(configuration!));
  if (config.livemode || !config.active || config.features.subscription_update.enabled
    || !config.features.subscription_cancel.enabled || config.features.subscription_cancel.mode !== "at_period_end") unavailable();
  return configuration!;
}

function snapshot(subscription: Stripe.Subscription): SubscriptionSnapshot {
  const userId = subscription.metadata.user_id;
  const item = subscription.items.data[0];
  if (subscription.livemode || subscription.metadata.application !== SUBSCRIPTION_APPLICATION
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId ?? "")
    || subscription.items.has_more || subscription.items.data.length !== 1 || item?.quantity !== 1) {
    throw new ApiError(400, "invalid_subscription", "Subscription could not be verified.");
  }
  const plan = planForPrice(item.price);
  if (subscription.metadata.plan_slug !== plan.slug || !item.current_period_end || !item.current_period_start) throw new Error("Invalid subscription period or plan.");
  return {
    userId, id: subscription.id, customerId: referenceId(subscription.customer)!, planSlug: plan.slug,
    status: subscription.status, cancelAtPeriodEnd: subscription.cancel_at_period_end
      || !!subscription.cancel_at && subscription.cancel_at <= item.current_period_end,
    periodEnd: new Date(item.current_period_end * 1000), createdAt: new Date(subscription.created * 1000),
  };
}

export async function createMonthlyCheckout(input: {
  userId: string; isDemoUser: boolean; planSlug: PlanSlug; idempotencyKey: string; origin: string; returnPath: string;
}) {
  requireEnabled(input.isDemoUser);
  const client = stripeClient();
  await requirePortalConfiguration();
  const plan = monthlyPlan(input.planSlug)!;
  const price = await stripeRequest(() => client.prices.retrieve(monthlyPriceId(plan.slug)!));
  planForPrice(price);
  if (!price.active) unavailable();
  const reservation = await db.transaction(async tx => {
    await tx.execute(sql`select id from ${creditAccounts} where ${creditAccounts.userId} = ${input.userId}::uuid for update`);
    const [account] = await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1);
    if (!account) throw new Error("Credit account is missing.");
    const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, input.userId)).limit(1);
    if (row?.stripeSubscriptionId) {
      const fresh = await stripeRequest(() => client.subscriptions.retrieve(row.stripeSubscriptionId!));
      if (!TERMINAL_SUBSCRIPTION_STATUSES.includes(fresh.status)) throw new ApiError(409, "subscription_exists", "You already have a subscription. Manage it below.");
    }
    if (row?.checkoutSessionId) {
      const previous = await stripeRequest(() => client.checkout.sessions.retrieve(row.checkoutSessionId!));
      if (previous.livemode || previous.client_reference_id !== input.userId || previous.metadata?.user_id !== input.userId) throw new Error("Previous checkout ownership mismatch.");
      const previousSubscription = referenceId(previous.subscription);
      // A paid checkout can precede its webhook by more than the reservation
      // lifetime. Check Stripe before permitting another subscription.
      if (previousSubscription) {
        const fresh = await stripeRequest(() => client.subscriptions.retrieve(previousSubscription));
        if (!TERMINAL_SUBSCRIPTION_STATUSES.includes(fresh.status)) throw new ApiError(409, "subscription_exists", "Your subscription is awaiting confirmation. Reopen Plan & usage shortly.");
      }
      if (previous.status === "open" && row.checkoutKey !== input.idempotencyKey) throw new ApiError(409, "checkout_pending", "A checkout is already open. Complete it before choosing another plan.");
    }
    // Persist the reservation before calling Stripe. Ambiguous network failures
    // retry the same session; another tab cannot open a second purchase.
    if (row?.checkoutExpiresAt && row.checkoutExpiresAt > new Date()) {
      if (row.checkoutKey !== input.idempotencyKey || row.checkoutPlanSlug !== plan.slug) {
        throw new ApiError(409, "checkout_pending", "A checkout is already open. Complete it or wait 30 minutes before choosing another plan.");
      }
      return row;
    }
    if (row?.checkoutKey && !row.checkoutSessionId) {
      // The external create may have succeeded before its local ID was saved.
      // Do not turn an ambiguous failure into a second billable subscription.
      throw new ApiError(409, "checkout_reconciliation_required", "Your previous checkout needs verification. Please contact support before trying again.");
    }
    const values = { userId: input.userId, checkoutKey: input.idempotencyKey, checkoutPlanSlug: plan.slug,
      checkoutExpiresAt: new Date(Date.now() + 31 * 60_000), checkoutSessionId: null, updatedAt: new Date() };
    const [saved] = await tx.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.userId, set: values }).returning();
    return saved;
  });
  const hash = createHash("sha256").update(`${input.userId}:${reservation.checkoutKey}`).digest("hex");
  const suffix = [...hash.slice(0, 12)].map(char => String.fromCharCode(97 + parseInt(char, 16))).join("");
  const metadata = { application: SUBSCRIPTION_APPLICATION, user_id: input.userId, plan_slug: plan.slug };
  const base = `${input.origin}${input.returnPath}?wallet=open&subscription_checkout=`;
  const session = await stripeRequest(() => client.checkout.sessions.create({
    mode: "subscription", ui_mode: "hosted_page", integration_identifier: `reshoot_monthly_${suffix}`,
    client_reference_id: input.userId, metadata,
    subscription_data: { metadata },
    ...(reservation.stripeCustomerId ? { customer: reservation.stripeCustomerId } : {}),
    line_items: [{ price: price.id, quantity: 1 }],
    expires_at: Math.floor(reservation.checkoutExpiresAt!.getTime() / 1000),
    success_url: `${base}{CHECKOUT_SESSION_ID}`, cancel_url: `${base}cancelled`,
  }, { idempotencyKey: `reshoot-monthly-${hash}` }));
  if (session.livemode || !session.id.startsWith("cs_test_")) throw new Error("Live checkout refused.");
  await db.update(subscriptions).set({ checkoutSessionId: session.id }).where(and(eq(subscriptions.userId, input.userId), eq(subscriptions.checkoutKey, input.idempotencyKey)));
  return { url: checkoutUrl(session.url) };
}

function invoiceReceipt(invoice: Stripe.Invoice): PaidMonthlyInvoice | undefined {
  if (invoice.livemode || invoice.status !== "paid" || !["subscription_create", "subscription_cycle"].includes(invoice.billing_reason ?? "")) return;
  const subscriptionId = referenceId(invoice.parent?.subscription_details?.subscription);
  if (!subscriptionId) return;
  if (invoice.lines.has_more || invoice.lines.data.length !== 1) throw new Error("Expected one monthly invoice line.");
  const line = invoice.lines.data[0];
  const priceId = referenceId(line.pricing?.price_details?.price);
  const plan = MONTHLY_PLANS.find(plan => monthlyPriceId(plan.slug) === priceId);
  if (!plan || line.quantity !== 1 || line.parent?.subscription_item_details?.proration
    || invoice.currency !== "usd" || invoice.amount_paid !== plan.usd * 100 || invoice.amount_remaining !== 0
    || line.amount !== plan.usd * 100 || line.period.end <= line.period.start) throw new Error("Invalid paid monthly invoice.");
  return { id: invoice.id, subscriptionId, customerId: referenceId(invoice.customer)!, planSlug: plan.slug,
    periodStart: new Date(line.period.start * 1000), periodEnd: new Date(line.period.end * 1000) };
}

export async function handleMonthlySubscriptionEvent(event: Stripe.Event) {
  let subscriptionId: string | undefined;
  let invoice: PaidMonthlyInvoice | undefined;
  const client = stripeClient();
  if (event.type === "invoice.paid") {
    const paid = await stripeRequest(() => client.invoices.retrieve(event.data.object.id));
    if (paid.parent?.subscription_details?.metadata?.application !== SUBSCRIPTION_APPLICATION) return;
    invoice = invoiceReceipt(paid);
    subscriptionId = invoice?.subscriptionId;
  } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"].includes(event.type)) {
    const object = event.data.object as Stripe.Subscription;
    if (object.metadata.application !== SUBSCRIPTION_APPLICATION) return;
    subscriptionId = object.id;
  } else if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
    if (event.data.object.parent?.subscription_details?.metadata?.application !== SUBSCRIPTION_APPLICATION) return;
    subscriptionId = referenceId(event.data.object.parent?.subscription_details?.subscription);
  } else if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (event.data.object.metadata?.application !== SUBSCRIPTION_APPLICATION) return;
    subscriptionId = referenceId(event.data.object.subscription);
  }
  if (!subscriptionId) return;
  if (!monthlyCatalogEnabled(true)) unavailable();
  const id = subscriptionId;
  const initial = snapshot(await stripeRequest(() => client.subscriptions.retrieve(id)));
  await synchronizeSubscription(initial.userId, async () => snapshot(await stripeRequest(() => client.subscriptions.retrieve(id))), invoice);
}

export async function monthlyCheckoutStatus(userId: string, sessionId: string) {
  if (!/^cs_test_[a-zA-Z0-9]+$/.test(sessionId)) throw new ApiError(400, "invalid_checkout", "Invalid checkout.");
  const session = await stripeRequest(() => stripeClient().checkout.sessions.retrieve(sessionId));
  if (session.livemode || session.mode !== "subscription" || session.metadata?.application !== SUBSCRIPTION_APPLICATION
    || session.client_reference_id !== userId || session.metadata.user_id !== userId) throw new ApiError(404, "checkout_not_found", "Checkout not found.");
  const subscriptionId = referenceId(session.subscription);
  const receipts = subscriptionId ? await db.select().from(subscriptionInvoices)
    .where(and(eq(subscriptionInvoices.userId, userId), eq(subscriptionInvoices.stripeSubscriptionId, subscriptionId))).limit(1) : [];
  return { status: receipts.length ? "complete" : session.status === "expired" ? "expired" : "pending" };
}

export async function createSubscriptionPortal(userId: string, isDemo: boolean, origin: string, returnPath: string) {
  if (!portalConfigured(isDemo)) unavailable();
  const configuration = await requirePortalConfiguration();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!row?.stripeCustomerId) throw new ApiError(409, "no_subscription", "There is no subscription to manage.");
  const client = stripeClient();
  const session = await stripeRequest(() => client.billingPortal.sessions.create({
    customer: row.stripeCustomerId!, configuration, return_url: `${origin}${returnPath}?wallet=open`,
  }));
  const url = new URL(session.url);
  if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com" || url.username || url.password) throw new Error("Invalid billing portal URL.");
  return { url: url.href };
}
