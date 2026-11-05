import { describe, expect, it } from "vitest";
import { stripeTestCheckoutEnabledForEnvironment } from "../lib/credits/policy";
const valid = { isDemoUser: true, paymentsMode: "stripe_test", stripeKey: "rk_test_fixture", webhookSecret: "whsec_fixture" };
describe("Stripe test checkout policy", () => {
  it("requires explicit test mode and both credentials", () => {
    expect(stripeTestCheckoutEnabledForEnvironment(valid)).toBe(true);
    for (const paymentsMode of [undefined, "simulated", "disabled", "live", ""]) {
      expect(stripeTestCheckoutEnabledForEnvironment({ ...valid, paymentsMode })).toBe(false);
    }
    expect(stripeTestCheckoutEnabledForEnvironment({ ...valid, webhookSecret: undefined })).toBe(false);
    expect(stripeTestCheckoutEnabledForEnvironment({ ...valid, stripeKey: undefined })).toBe(false);
  });
  it("rejects live keys and real-money accounts", () => {
    for (const stripeKey of ["rk_live_fixture", "sk_live_fixture", "placeholder", "pk_test_fixture"]) {
      expect(stripeTestCheckoutEnabledForEnvironment({ ...valid, stripeKey })).toBe(false);
    }
    expect(stripeTestCheckoutEnabledForEnvironment({ ...valid, isDemoUser: false })).toBe(false);
  });
});
