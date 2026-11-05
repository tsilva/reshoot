import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ retrieveCheckout: vi.fn(), price: vi.fn(), subscription: vi.fn(), invoice: vi.fn(), config: vi.fn(), checkout: vi.fn(), portal: vi.fn(), sync: vi.fn(), transaction: vi.fn(), update: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction, update: () => ({ set: () => ({ where: mocks.update }) }) } }));
vi.mock("@/lib/payments/stripe", () => ({ stripeRequest: (request: () => unknown) => request(), stripeClient: () => ({ prices: { retrieve: mocks.price }, subscriptions: { retrieve: mocks.subscription }, invoices: { retrieve: mocks.invoice }, checkout: { sessions: { create: mocks.checkout, retrieve: mocks.retrieveCheckout } }, billingPortal: { configurations: { retrieve: mocks.config }, sessions: { create: mocks.portal } } }) }));
vi.mock("@/lib/subscriptions/service", () => ({ synchronizeSubscription: mocks.sync }));
import { createMonthlyCheckout, handleMonthlySubscriptionEvent } from "../lib/subscriptions/stripe";
const application = "reshoot-monthly-v1";
const userId = "00000000-0000-4000-8000-000000000001";
const price = { id: "price_studio", livemode: false, active: true, currency: "usd", unit_amount: 2900, type: "recurring", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };
const subscription = { id: "sub_one", customer: "cus_one", created: 100, livemode: false, metadata: { application, user_id: userId, plan_slug: "studio" }, status: "active", cancel_at_period_end: false, items: { has_more: false, data: [{ quantity: 1, price, current_period_start: 100, current_period_end: 200 }] } };
const invoice = { id: "in_one", livemode: false, status: "paid", billing_reason: "subscription_cycle", currency: "usd", amount_paid: 2900, amount_remaining: 0, customer: "cus_one", parent: { subscription_details: { subscription: "sub_one", metadata: { application } } }, lines: { has_more: false, data: [{ amount: 2900, quantity: 1, pricing: { price_details: { price: "price_studio" } }, parent: { subscription_item_details: { proration: false } }, period: { start: 100, end: 200 } }] } };
function event(type: string, object: unknown) { return { id: "evt_fixture", type, livemode: false, data: { object } } as Stripe.Event; }
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.stubEnv("RESHOOT_PAYMENTS_MODE", "stripe_test"); vi.stubEnv("STRIPE_TEST_SECRET_KEY", "rk_test_fixture"); vi.stubEnv("STRIPE_TEST_WEBHOOK_SECRET", "whsec_fixture");
  for (const name of ["starter", "studio", "pro"]) vi.stubEnv(`STRIPE_TEST_${name.toUpperCase()}_MONTHLY_PRICE_ID`, `price_${name}`);
  vi.stubEnv("STRIPE_TEST_PORTAL_CONFIGURATION_ID", "bpc_fixture");
  mocks.price.mockResolvedValue(price); mocks.subscription.mockResolvedValue(subscription); mocks.invoice.mockResolvedValue(invoice);
  mocks.config.mockResolvedValue({ active: true, livemode: false, features: { subscription_update: { enabled: false }, subscription_cancel: { enabled: true, mode: "at_period_end" } } });
  mocks.sync.mockImplementation(async (_user, load) => { await load(); });
  mocks.transaction.mockResolvedValue({ checkoutKey: "key", checkoutPlanSlug: "studio", checkoutExpiresAt: new Date(Date.now() + 31 * 60000), stripeCustomerId: "cus_one" });
  mocks.checkout.mockResolvedValue({ id: "cs_test_fixture", livemode: false, url: "https://checkout.stripe.com/fixture" });
});
describe("verified subscription event dispatch", () => {
  it("grants only the retrieved paid recurring invoice, with exact plan and period", async () => {
    await handleMonthlySubscriptionEvent(event("invoice.paid", { id: "in_one" }));
    expect(mocks.sync).toHaveBeenCalledWith(userId, expect.any(Function), { id: "in_one", subscriptionId: "sub_one", customerId: "cus_one", planSlug: "studio", periodStart: new Date(100000), periodEnd: new Date(200000) });
    expect(mocks.subscription).toHaveBeenCalledTimes(2);
  });
  it("checkout completion syncs state without granting an allowance", async () => {
    await handleMonthlySubscriptionEvent(event("checkout.session.completed", { metadata: { application }, subscription: "sub_one" }));
    expect(mocks.sync.mock.calls[0][2]).toBeUndefined(); expect(mocks.invoice).not.toHaveBeenCalled();
  });
  it("refreshes failed-payment state without granting credits", async () => {
    mocks.subscription.mockResolvedValue({ ...subscription, status: "past_due" });
    await handleMonthlySubscriptionEvent(event("invoice.payment_failed", invoice));
    expect(mocks.sync.mock.calls[0][2]).toBeUndefined();
  });
  it.each([
    { status: "open" }, { billing_reason: "subscription_update" }, { livemode: true },
  ])("does not grant for unqualified invoices %j", async patch => {
    mocks.invoice.mockResolvedValue({ ...invoice, ...patch });
    await handleMonthlySubscriptionEvent(event("invoice.paid", { id: "in_one" }));
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it.each([{ amount_paid: 1 }, { currency: "eur" }, { amount_remaining: 1 }, { lines: { ...invoice.lines, has_more: true } }])("rejects mismatched receipts %j", async patch => {
    mocks.invoice.mockResolvedValue({ ...invoice, ...patch });
    await expect(handleMonthlySubscriptionEvent(event("invoice.paid", { id: "in_one" }))).rejects.toThrow();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("ignores another application's invoices", async () => {
    mocks.invoice.mockResolvedValue({ ...invoice, parent: null });
    await handleMonthlySubscriptionEvent(event("invoice.paid", { id: "in_other" }));
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("rejects live or altered subscription prices", async () => {
    mocks.subscription.mockResolvedValue({ ...subscription, livemode: true });
    await expect(handleMonthlySubscriptionEvent(event("customer.subscription.updated", subscription))).rejects.toThrow();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
const input = { userId, isDemoUser: true, planSlug: "studio" as const, idempotencyKey: "key", origin: "https://reshoot.example", returnPath: "/" };
describe("subscription checkout request", () => {
  it("uses recurring Checkout, fixed server price, owned customer and matching subscription metadata", async () => {
    await createMonthlyCheckout(input);
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ mode: "subscription", customer: "cus_one", line_items: [{ price: "price_studio", quantity: 1 }], subscription_data: { metadata: { application, user_id: userId, plan_slug: "studio" } } }), expect.objectContaining({ idempotencyKey: expect.stringMatching(/^reshoot-monthly-/) }));
  });
  it("refuses a portal that would cancel immediately or allow plan changes", async () => {
    mocks.config.mockResolvedValue({ active: true, livemode: false, features: { subscription_update: { enabled: true }, subscription_cancel: { enabled: true, mode: "immediately" } } });
    await expect(createMonthlyCheckout(input)).rejects.toMatchObject({ status: 503 });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("refuses a mismatched price before creating a subscription session", async () => {
    mocks.price.mockResolvedValue({ ...price, unit_amount: 100 });
    await expect(createMonthlyCheckout(input)).rejects.toMatchObject({ status: 409 });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("disables signup when cancellation configuration is missing", async () => {
    vi.stubEnv("STRIPE_TEST_PORTAL_CONFIGURATION_ID", "");
    await expect(createMonthlyCheckout(input)).rejects.toMatchObject({ status: 503 });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});


it("prevents a duplicate subscription when a completed checkout's webhook is delayed beyond expiry", async () => {
  const pending = { checkoutKey: "old-key", checkoutSessionId: "cs_test_previous", checkoutExpiresAt: new Date(0), stripeSubscriptionId: null };
  let reads = 0;
  mocks.transaction.mockImplementation(async callback => callback({
    execute: async () => {},
    select: () => ({ from: () => ({ where: () => ({ limit: async () => ++reads === 1 ? [{ id: "account" }] : [pending] }) }) }),
  }));
  mocks.retrieveCheckout.mockResolvedValue({ livemode: false, status: "complete", client_reference_id: userId, metadata: { user_id: userId }, subscription: "sub_one" });
  await expect(createMonthlyCheckout(input)).rejects.toMatchObject({ status: 409, code: "subscription_exists" });
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("does not create another subscription after an unresolved external-create failure", async () => {
  let reads = 0;
  mocks.transaction.mockImplementation(async callback => callback({
    execute: async () => {},
    select: () => ({ from: () => ({ where: () => ({ limit: async () => ++reads === 1 ? [{ id: "account" }] : [{ checkoutKey: "ambiguous", checkoutSessionId: null, checkoutExpiresAt: new Date(0) }] }) }) }),
  }));
  await expect(createMonthlyCheckout(input)).rejects.toMatchObject({ code: "checkout_reconciliation_required" });
  expect(mocks.checkout).not.toHaveBeenCalled();
});
