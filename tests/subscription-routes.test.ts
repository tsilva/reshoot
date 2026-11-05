import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn(), portal: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: state.user }));
vi.mock("@/lib/subscriptions/stripe", () => ({ createMonthlyCheckout: state.create, createSubscriptionPortal: state.portal }));
import { POST } from "../app/api/account/subscription-checkouts/route";
import { POST as portal } from "../app/api/account/subscription-portal/route";
import { POST as topup } from "../app/api/account/stripe-checkouts/route";
import { ApiError } from "../lib/api/errors";
const body = { planSlug: "studio", idempotencyKey: "00000000-0000-4000-8000-000000000001", returnPath: "/" };
function request(payload = body, origin = "https://reshoot.example") {
  return new Request("https://reshoot.example/api/account/subscription-checkouts", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}
beforeEach(() => {
  state.user.mockReset().mockResolvedValue({ id: "account", isDemo: true });
  state.create.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/fixture" });
  state.portal.mockReset().mockResolvedValue({ url: "https://billing.stripe.com/fixture" });
});
it("uses the authenticated account and a server catalog plan", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(state.create).toHaveBeenCalledWith({ ...body, userId: "account", isDemoUser: true, origin: "https://reshoot.example" });
});
it("rejects cross-origin requests before Stripe or account access", async () => {
  expect((await POST(request(body, "https://other.example"))).status).toBe(403);
  expect(state.user).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled();
});
it("requires sign-in", async () => {
  state.user.mockRejectedValue(new ApiError(401, "sign_in_required", "Sign in."));
  expect((await POST(request())).status).toBe(401); expect(state.create).not.toHaveBeenCalled();
});
it.each([
  { ...body, usd: 1 }, { ...body, credits: 999999 }, { ...body, userId: "other" },
  { ...body, planSlug: "annual" }, { ...body, returnPath: "//other.example" }, { ...body, idempotencyKey: "bad" },
])("rejects untrusted billing input %j", async payload => {
  expect((await POST(request(payload as typeof body))).status).toBe(400); expect(state.create).not.toHaveBeenCalled();
});
it("opens only the authenticated account's portal", async () => {
  const req = request({ returnPath: "/" } as typeof body);
  expect((await portal(req)).status).toBe(200);
  expect(state.portal).toHaveBeenCalledWith("account", true, "https://reshoot.example", "/");
});
it("retires new one-time credit purchases", async () => {
  expect((await topup()).status).toBe(410); expect(state.create).not.toHaveBeenCalled();
});
