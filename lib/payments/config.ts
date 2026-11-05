import "server-only";

import { ApiError } from "@/lib/api/errors";
import { stripeTestCheckoutEnabledForEnvironment } from "@/lib/credits/policy";

export function stripeTestCheckoutEnabled(isDemoUser: boolean) {
  return stripeTestCheckoutEnabledForEnvironment({
    isDemoUser,
    paymentsMode: process.env.RESHOOT_PAYMENTS_MODE,
    stripeKey: process.env.STRIPE_TEST_SECRET_KEY,
    webhookSecret: process.env.STRIPE_TEST_WEBHOOK_SECRET,
  });
}

export function requireStripeTestConfiguration() {
  if (!stripeTestCheckoutEnabled(true)) {
    throw new ApiError(503, "checkout_unavailable", "Stripe test checkout is not configured. No payment was started.");
  }
  return {
    key: process.env.STRIPE_TEST_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_TEST_WEBHOOK_SECRET!,
  };
}
