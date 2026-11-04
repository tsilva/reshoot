import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api/errors";

const state = vi.hoisted(() => ({ user: vi.fn(), purchase: vi.fn(), summary: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: state.user }));
vi.mock("@/lib/credits/service", () => ({ createDemoPurchase: state.purchase, getCreditSummary: state.summary }));
import { POST } from "../app/api/account/demo-checkouts/route";

function request(body: unknown, origin = "https://reshoot.example") {
  return new Request("https://reshoot.example/api/account/demo-checkouts", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const purchase = { packSlug: "starter", idempotencyKey: "checkout-attempt-one", outcome: "succeeded" };

describe("simulated checkout boundary", () => {
  beforeEach(() => {
    state.user.mockReset().mockResolvedValue({ id: "verified-owner", isDemo: true });
    state.purchase.mockReset().mockResolvedValue({ id: "purchase-one", credits: 1000, createdAt: new Date("2026-11-04T12:00:00Z") });
    state.summary.mockReset().mockResolvedValue({ availableCredits: 1000 });
  });

  it("credits the authenticated owner after an explicitly simulated successful payment", async () => {
    const response = await POST(request(purchase));
    expect(response.status).toBe(200);
    expect(state.purchase).toHaveBeenCalledWith({ ...purchase, userId: "verified-owner", isDemoUser: true });
    expect(state.summary).toHaveBeenCalledWith("verified-owner", true);
    expect(await response.json()).toMatchObject({ purchase: { id: "purchase-one", credits: 1000 }, credits: { availableCredits: 1000 } });
  });

  it("does not change balances for a simulated decline", async () => {
    const response = await POST(request({ ...purchase, outcome: "declined" }));
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: { code: "simulated_payment_declined" } });
    expect(state.purchase).not.toHaveBeenCalled();
    expect(state.summary).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    state.user.mockRejectedValue(new ApiError(401, "sign_in_required", "Sign in to continue."));
    expect((await POST(request(purchase))).status).toBe(401);
    expect(state.purchase).not.toHaveBeenCalled();
  });

  it("rejects cross-origin checkout before resolving an account", async () => {
    expect((await POST(request(purchase, "https://other.example"))).status).toBe(403);
    expect(state.user).not.toHaveBeenCalled();
    expect(state.purchase).not.toHaveBeenCalled();
  });

  it.each([
    { ...purchase, packSlug: "invented" },
    { ...purchase, outcome: "live" },
    { ...purchase, credits: 1000000 },
    { ...purchase, userId: "someone-else" },
  ])("rejects a forged checkout payload: %s", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(state.purchase).not.toHaveBeenCalled();
  });
});
