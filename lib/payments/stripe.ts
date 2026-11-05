import "server-only";

import { createHash } from "node:crypto";
import Stripe from "stripe";
import { ApiError } from "@/lib/api/errors";
import { findStripeTestPurchase, getCheckoutPack, grantStripeTestCredits } from "@/lib/credits/service";
import { requireStripeTestConfiguration } from "./config";
import { STRIPE_TEST_APPLICATION, STRIPE_TEST_SESSION_PATTERN, stripeTestReceipt } from "./receipt";

export function stripeClient() {
  const { key } = requireStripeTestConfiguration();
  return new Stripe(key, {
    // The newest SDK eligible under the seven-day package hold predates this API revision.
    apiVersion: "2026-10-28.endive" as Stripe.LatestApiVersion,
    timeout: 10_000, maxNetworkRetries: 1,
    appInfo: { name: "Reshoot", version: "stripe-test-v1" },
  });
}

export async function stripeRequest<T>(request: () => Promise<T>): Promise<T> {
  try { return await request(); } catch {
    // Stripe errors may contain request details; keep provider output out of logs and responses.
    throw new ApiError(502, "stripe_unavailable", "Stripe test checkout could not be reached. Please try again.");
  }
}

export async function createStripeTestCheckout(input: {
  userId: string; isDemoUser: boolean; packSlug: string; idempotencyKey: string;
  origin: string; returnPath: string;
}) {
  const client = stripeClient();
  const pack = await getCheckoutPack(input.userId, input.isDemoUser, input.packSlug);
  const cents = pack.usdMicros / 10_000;
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new ApiError(409, "invalid_price", "This credit pack is unavailable.");
  const key = createHash("sha256").update(`${input.userId}:${input.idempotencyKey}`).digest("hex");
  const suffix = Array.from(Buffer.from(key.slice(0, 16), "hex"), (value) => String.fromCharCode(97 + value % 26)).join("");
  const base = `${input.origin}${input.returnPath}?wallet=open&stripe_checkout=`;
  const session = await stripeRequest(() => client.checkout.sessions.create({
    mode: "payment", ui_mode: "hosted_page",
    integration_identifier: `reshoot_test_${suffix}`,
    client_reference_id: input.userId,
    metadata: {
      application: STRIPE_TEST_APPLICATION, user_id: input.userId,
      pack_id: pack.id, pack_slug: pack.slug,
      credits: String(pack.credits), usd_micros: String(pack.usdMicros),
    },
    line_items: [{ quantity: 1, price_data: {
      currency: "usd", unit_amount: cents,
      product_data: { name: `${pack.name} — ${pack.credits.toLocaleString("en-US")} test credits` },
    } }],
    adaptive_pricing: { enabled: false },
    success_url: `${base}{CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}cancelled`,
  }, { idempotencyKey: `reshoot-test-${key}` }));
  if (session.livemode !== false || !STRIPE_TEST_SESSION_PATTERN.test(session.id) || !session.url) {
    throw new ApiError(502, "invalid_stripe_checkout", "Stripe did not return a test checkout.");
  }
  if (!URL.canParse(session.url)) throw new ApiError(502, "invalid_stripe_checkout", "Stripe did not return a valid checkout URL.");
  const url = new URL(session.url);
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password) {
    throw new ApiError(502, "invalid_stripe_checkout", "Stripe did not return a valid checkout URL.");
  }
  return { url: session.url };
}

async function retrieveSession(sessionId: string) {
  if (!STRIPE_TEST_SESSION_PATTERN.test(sessionId)) throw new ApiError(400, "invalid_checkout", "Invalid test checkout.");
  const client = stripeClient();
  return stripeRequest(() => client.checkout.sessions.retrieve(sessionId, { expand: ["line_items", "payment_intent"] }));
}

export function verifyStripeTestEvent(payload: string, signature: string | null) {
  const { webhookSecret } = requireStripeTestConfiguration();
  if (!signature) throw new ApiError(400, "invalid_stripe_signature", "Invalid Stripe signature.");
  let event: Stripe.Event;
  try { event = stripeClient().webhooks.constructEvent(payload, signature, webhookSecret); } catch {
    throw new ApiError(400, "invalid_stripe_signature", "Invalid Stripe signature.");
  }
  if (event.livemode !== false) throw new ApiError(400, "live_payments_disabled", "Live payments are disabled.");
  return event;
}

export async function handleStripeTestEvent(event: Stripe.Event) {
  if (event.livemode !== false) throw new ApiError(400, "live_payments_disabled", "Live payments are disabled.");
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return;
  if (event.data.object.metadata?.application !== STRIPE_TEST_APPLICATION) return;
  const session = await retrieveSession(event.data.object.id);
  const receipt = stripeTestReceipt(session);
  if (session.status !== "complete" || session.payment_status !== "paid") return;
  await grantStripeTestCredits(receipt);
}

export async function getStripeTestCheckoutStatus(userId: string, sessionId: string) {
  const session = await retrieveSession(sessionId);
  // Verify ownership before returning any checkout details.
  if (session.client_reference_id !== userId || session.metadata?.user_id !== userId) {
    throw new ApiError(404, "checkout_not_found", "Checkout not found.");
  }
  const receipt = stripeTestReceipt(session);
  const purchase = await findStripeTestPurchase(userId, sessionId);
  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const status = purchase ? "complete" : session.status === "expired" ? "expired"
    : intent?.status === "canceled" || intent?.status === "requires_payment_method" ? "failed" : "pending";
  // This read never grants credits. Only a verified webhook can fulfill a session.
  return { status, packCredits: receipt.credits };
}
