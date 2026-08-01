import { describe, expect, it } from "vitest";
import { demoCheckoutEnabledForEnvironment } from "../lib/credits/policy";

describe("demo checkout environment policy", () => {
  it("is enabled for the demo user locally and in previews", () => {
    expect(
      demoCheckoutEnabledForEnvironment({ isDemoUser: true, nodeEnv: "development" }),
    ).toBe(true);
    expect(
      demoCheckoutEnabledForEnvironment({ isDemoUser: true, nodeEnv: "production" }),
    ).toBe(true);
    expect(
      demoCheckoutEnabledForEnvironment({
        isDemoUser: true,
        nodeEnv: "production",
        vercelEnv: "preview",
      }),
    ).toBe(true);
  });

  it("never mints production or non-demo credits", () => {
    expect(
      demoCheckoutEnabledForEnvironment({
        isDemoUser: true,
        nodeEnv: "production",
        vercelEnv: "production",
      }),
    ).toBe(false);
    expect(
      demoCheckoutEnabledForEnvironment({
        isDemoUser: false,
        nodeEnv: "development",
      }),
    ).toBe(false);
  });
});
