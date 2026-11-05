import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), pack: vi.fn(), grant: vi.fn(), purchase: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/credits/service", () => ({
  getCheckoutPack: state.pack, grantStripeTestCredits: state.grant, findStripeTestPurchase: state.purchase,
}));
vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  return { default: class {
    checkout = { sessions: { create: state.create, retrieve: state.retrieve } };
    webhooks = new actual.default("sk_test_offline_fixture").webhooks;
  } };
});
import { createStripeTestCheckout, getStripeTestCheckoutStatus, handleStripeTestEvent, verifyStripeTestEvent } from "../lib/payments/stripe";
import { STRIPE_TEST_APPLICATION } from "../lib/payments/receipt";

const owner = "11111111-1111-4111-8111-111111111111";
const packId = "22222222-2222-4222-8222-222222222222";
const sessionId = "cs_test_fixture123";
const input = { userId: owner, isDemoUser: true, packSlug: "starter", idempotencyKey: "retry-one", origin: "https://reshoot.example", returnPath: "/" };
function session(patch: Record<string, unknown> = {}) {
  return {
    id: sessionId, object: "checkout.session", livemode: false, mode: "payment", status: "complete", payment_status: "paid",
    client_reference_id: owner, currency: "usd", amount_total: 1000, amount_subtotal: 1000,
    metadata: { application: STRIPE_TEST_APPLICATION, user_id: owner, pack_id: packId, pack_slug: "starter", credits: "1000", usd_micros: "10000000" },
    line_items: { has_more: false, data: [{ quantity: 1, amount_total: 1000, currency: "usd", price: { unit_amount: 1000, currency: "usd" } }] },
    ...patch,
  } as unknown as Stripe.Checkout.Session;
}
function event(type: string = "checkout.session.completed", patch: Record<string, unknown> = {}) {
  return { id: "evt_fixture", type, livemode: false, data: { object: session() }, ...patch } as Stripe.Event;
}

describe("Stripe test checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESHOOT_PAYMENTS_MODE", "stripe_test");
    vi.stubEnv("STRIPE_TEST_SECRET_KEY", "rk_test_offline_fixture");
    vi.stubEnv("STRIPE_TEST_WEBHOOK_SECRET", "whsec_offline_fixture");
    state.pack.mockResolvedValue({ id: packId, slug: "starter", name: "Starter", credits: 1000, usdMicros: 10000000 });
    state.create.mockResolvedValue({ id: sessionId, livemode: false, url: `https://checkout.stripe.com/c/pay/${sessionId}` });
    state.retrieve.mockResolvedValue(session());
    state.purchase.mockResolvedValue(undefined);
  });
  it("uses server catalog pricing, stable Stripe idempotency and no local fulfillment", async () => {
    await createStripeTestCheckout(input);
    await createStripeTestCheckout(input);
    const [params, options] = state.create.mock.calls[0];
    expect(params).toMatchObject({ mode: "payment", ui_mode: "hosted_page", client_reference_id: owner,
      metadata: { application: STRIPE_TEST_APPLICATION, credits: "1000", usd_micros: "10000000" },
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 1000 } }],
      success_url: "https://reshoot.example/?wallet=open&stripe_checkout={CHECKOUT_SESSION_ID}",
      cancel_url: "https://reshoot.example/?wallet=open&stripe_checkout=cancelled",
    });
    expect(params).not.toHaveProperty("payment_method_types");
    expect(params).not.toHaveProperty("customer");
    expect(params.integration_identifier).toMatch(/^reshoot_test_[a-z]{8}$/);
    expect(state.create.mock.calls[1]).toEqual([params, options]);
    expect(state.grant).not.toHaveBeenCalled();
  });
  it("never calls Stripe with live credentials", async () => {
    vi.stubEnv("STRIPE_TEST_SECRET_KEY", "sk_live_fixture");
    await expect(createStripeTestCheckout(input)).rejects.toMatchObject({ status: 503 });
    expect(state.create).not.toHaveBeenCalled();
  });
  it.each([
    { livemode: true }, { id: "cs_live_fixture" }, { url: "https://checkout.stripe.com.evil.example/pay" },
    { url: "http://checkout.stripe.com/pay" },
  ])("rejects invalid sessions or redirect URLs: %s", async (patch) => {
    state.create.mockResolvedValue({ id: sessionId, livemode: false, url: "https://checkout.stripe.com/pay", ...patch });
    await expect(createStripeTestCheckout(input)).rejects.toMatchObject({ status: 502 });
  });
  it("fulfills both completed and delayed-success events by the retrieved session", async () => {
    await handleStripeTestEvent(event());
    await handleStripeTestEvent(event("checkout.session.async_payment_succeeded"));
    expect(state.retrieve).toHaveBeenCalledWith(sessionId, { expand: ["line_items", "payment_intent"] });
    expect(state.grant).toHaveBeenCalledTimes(2);
    expect(state.grant).toHaveBeenCalledWith({ sessionId, userId: owner, packId, packSlug: "starter", credits: 1000, usdMicros: 10000000 });
  });
  it("does not fulfill an unpaid completed session or failed/irrelevant event", async () => {
    state.retrieve.mockResolvedValue(session({ payment_status: "unpaid" }));
    await handleStripeTestEvent(event());
    await handleStripeTestEvent(event("checkout.session.async_payment_failed"));
    await handleStripeTestEvent(event("payment_intent.succeeded"));
    expect(state.grant).not.toHaveBeenCalled();
  });
  it.each([
    { livemode: true }, { amount_total: 500 }, { currency: "eur" }, { mode: "subscription" },
    { client_reference_id: "another-owner" }, { line_items: { has_more: false, data: [] } },
    { metadata: { application: STRIPE_TEST_APPLICATION, credits: "999999999" } },
  ])("rejects receipt mismatches before granting: %s", async (patch) => {
    state.retrieve.mockResolvedValue(session(patch));
    await expect(handleStripeTestEvent(event())).rejects.toMatchObject({ status: 400 });
    expect(state.grant).not.toHaveBeenCalled();
  });
  it("checks ownership on status reads and never fulfills from a return URL", async () => {
    await expect(getStripeTestCheckoutStatus("another-owner", sessionId)).rejects.toMatchObject({ status: 404 });
    expect(await getStripeTestCheckoutStatus(owner, sessionId)).toEqual({ status: "pending", packCredits: 1000 });
    state.purchase.mockResolvedValue({ id: "recorded-purchase" });
    expect(await getStripeTestCheckoutStatus(owner, sessionId)).toMatchObject({ status: "complete" });
    expect(state.grant).not.toHaveBeenCalled();
  });
  it("rejects invalid, altered and stale webhook signatures with the real SDK verifier", async () => {
    const Actual = (await vi.importActual<typeof import("stripe")>("stripe")).default;
    const signer = new Actual("sk_test_offline_fixture");
    const payload = JSON.stringify(event());
    const signature = signer.webhooks.generateTestHeaderString({ payload, secret: "whsec_offline_fixture" });
    expect(verifyStripeTestEvent(payload, signature).id).toBe("evt_fixture");
    expect(() => verifyStripeTestEvent(payload + " ", signature)).toThrow("Invalid Stripe signature");
    expect(() => verifyStripeTestEvent(payload, null)).toThrow("Invalid Stripe signature");
    const stale = signer.webhooks.generateTestHeaderString({ payload, secret: "whsec_offline_fixture", timestamp: 1 });
    expect(() => verifyStripeTestEvent(payload, stale)).toThrow("Invalid Stripe signature");
    const live = JSON.stringify(event(undefined, { livemode: true }));
    const liveSignature = signer.webhooks.generateTestHeaderString({ payload: live, secret: "whsec_offline_fixture" });
    expect(() => verifyStripeTestEvent(live, liveSignature)).toThrow("Live payments are disabled");
  });
  it("suppresses Stripe errors instead of leaking provider request details", async () => {
    state.create.mockRejectedValue(new Error("private provider details"));
    await expect(createStripeTestCheckout(input)).rejects.toMatchObject({ message: "Stripe test checkout could not be reached. Please try again." });
  });
});
