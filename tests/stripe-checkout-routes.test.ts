import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api/errors";

const state = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn(), verify: vi.fn(), handle: vi.fn(), status: vi.fn(), summary: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: state.user }));
vi.mock("@/lib/payments/stripe", () => ({ createStripeTestCheckout: state.create, verifyStripeTestEvent: state.verify, handleStripeTestEvent: state.handle, getStripeTestCheckoutStatus: state.status }));
vi.mock("@/lib/credits/service", () => ({ getCreditSummary: state.summary }));
vi.mock("@/lib/subscriptions/stripe", () => ({ handleMonthlySubscriptionEvent: vi.fn() }));
import { POST } from "../app/api/account/stripe-checkouts/route";
import { POST as webhook } from "../app/api/stripe/webhook/route";
import { GET } from "../app/api/account/stripe-checkouts/[sessionId]/route";

beforeEach(() => {
  vi.resetAllMocks();
  state.user.mockResolvedValue({ id: "owner", isDemo: true });
  state.create.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
});
it("does not create one-time sessions after the monthly-only decision", async () => {
  const response = await POST();
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ error: { code: "topups_retired" } });
  expect(state.create).not.toHaveBeenCalled();
  expect(state.user).not.toHaveBeenCalled();
});
it("verifies the exact raw webhook body before handling", async () => {
  state.verify.mockReturnValue({ id: "evt_verified" });
  const raw = '{ "id": "evt_verified" }';
  expect((await webhook(new Request("https://reshoot.example/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "test-signature" }, body: raw }))).status).toBe(200);
  expect(state.verify).toHaveBeenCalledWith(raw, "test-signature");
  expect(state.handle).toHaveBeenCalledWith({ id: "evt_verified" });
});
it("rejects invalid signatures without handling the event", async () => {
  state.verify.mockImplementation(() => { throw new ApiError(400, "invalid_stripe_signature", "Invalid signature."); });
  expect((await webhook(new Request("https://reshoot.example/api/stripe/webhook", { method: "POST", body: "{}" }))).status).toBe(400);
  expect(state.handle).not.toHaveBeenCalled();
});
it("makes status responses private and uses the authenticated account", async () => {
  state.status.mockResolvedValue({ status: "pending", packCredits: 1000 });
  state.summary.mockResolvedValue({ availableCredits: 100 });
  const response = await GET(new Request("https://reshoot.example/api/account/stripe-checkouts/cs_test_one"), { params: Promise.resolve({ sessionId: "cs_test_one" }) });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(state.status).toHaveBeenCalledWith("owner", "cs_test_one");
  expect(await response.json()).toMatchObject({ status: "pending", credits: { availableCredits: 100 } });
});

it("leaves failed fulfillment retryable instead of acknowledging it", async () => {
  state.verify.mockReturnValue({ id: "evt_verified" });
  state.handle.mockRejectedValue(new ApiError(503, "temporarily_unavailable", "Try again."));
  const response = await webhook(new Request("https://reshoot.example/api/stripe/webhook", { method: "POST", body: "{}" }));
  expect(response.status).toBe(503);
});
