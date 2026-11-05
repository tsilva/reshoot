import type Stripe from "stripe";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";

export const STRIPE_TEST_APPLICATION = "reshoot-test-credits-v1";
export const STRIPE_TEST_SESSION_PATTERN = /^cs_test_[A-Za-z0-9]+$/;

const receiptSchema = z.object({
  application: z.literal(STRIPE_TEST_APPLICATION),
  user_id: z.uuid(),
  pack_id: z.uuid(),
  pack_slug: z.enum(["starter", "studio", "pro"]),
  credits: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(1_000_000)),
  usd_micros: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(2_000_000_000).multipleOf(10_000)),
});

export type StripeTestReceipt = {
  sessionId: string;
  userId: string;
  packId: string;
  packSlug: string;
  credits: number;
  usdMicros: number;
};

// Call only with a Session retrieved server-side from Stripe, never browser JSON.
export function stripeTestReceipt(session: Stripe.Checkout.Session): StripeTestReceipt {
  const parsed = receiptSchema.safeParse(session.metadata);
  const fail = () => { throw new ApiError(400, "invalid_stripe_checkout", "This is not a valid Reshoot test checkout."); };
  if (!parsed.success) return fail();
  const receipt = parsed.data;
  const cents = receipt.usd_micros / 10_000;
  const item = session.line_items?.data[0];
  if (!STRIPE_TEST_SESSION_PATTERN.test(session.id) || session.livemode !== false
    || session.mode !== "payment" || session.client_reference_id !== receipt.user_id
    || session.currency !== "usd" || session.amount_total !== cents || session.amount_subtotal !== cents
    || session.line_items?.has_more || session.line_items?.data.length !== 1
    || item?.quantity !== 1 || item.amount_total !== cents || item.currency !== "usd"
    || item.price?.unit_amount !== cents || item.price.currency !== "usd") return fail();
  return {
    sessionId: session.id, userId: receipt.user_id, packId: receipt.pack_id,
    packSlug: receipt.pack_slug, credits: receipt.credits, usdMicros: receipt.usd_micros,
  };
}
