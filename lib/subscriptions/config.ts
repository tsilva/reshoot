import "server-only";
import { stripeTestCheckoutEnabled } from "@/lib/payments/config";
import { MONTHLY_PLANS, type PlanSlug } from "./catalog";

export function monthlyPriceId(slug: PlanSlug) {
  const value = process.env[`STRIPE_TEST_${slug.toUpperCase()}_MONTHLY_PRICE_ID`];
  return value && /^price_[a-zA-Z0-9]+$/.test(value) ? value : null;
}
export function monthlyCatalogEnabled(isDemo: boolean) {
  const ids = MONTHLY_PLANS.map(plan => monthlyPriceId(plan.slug));
  return stripeTestCheckoutEnabled(isDemo) && ids.every(Boolean) && new Set(ids).size === ids.length;
}
export function portalConfigured(isDemo: boolean) {
  return stripeTestCheckoutEnabled(isDemo) && /^bpc_[a-zA-Z0-9]+$/.test(process.env.STRIPE_TEST_PORTAL_CONFIGURATION_ID ?? "");
}
export function subscriptionsEnabled(isDemo: boolean) {
  return monthlyCatalogEnabled(isDemo) && portalConfigured(isDemo);
}
