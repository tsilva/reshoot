export const MONTHLY_PLANS = [
  { slug: "starter", name: "Starter", description: "For occasional shoots", usd: 15, credits: 750, badge: null },
  { slug: "studio", name: "Studio", description: "For regular product shoots", usd: 29, credits: 3000, badge: "Best value" },
  { slug: "pro", name: "Pro", description: "For large catalogs", usd: 89, credits: 8000, badge: "Most usage" },
] as const;

export type PlanSlug = typeof MONTHLY_PLANS[number]["slug"];
export function monthlyPlan(slug: string) { return MONTHLY_PLANS.find(plan => plan.slug === slug); }
export const SUBSCRIPTION_APPLICATION = "reshoot-monthly-v1";
export const TERMINAL_SUBSCRIPTION_STATUSES = ["canceled", "incomplete_expired"];
