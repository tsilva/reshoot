import { describe, expect, it } from "vitest";
import { providerRejectionReason } from "../lib/generation/provider-rejection";

describe("provider rejection diagnostics", () => {
  it.each(["Budget limit exceeded (weekly limit).", "Credit limit exhausted.",
    "Key limit reached.", "Insufficient credits."])("recognizes explicit budget rejection: %s", (message) => {
    expect(providerRejectionReason(message)).toBe("budget_limit");
  });
  it.each([null, "Request forbidden (403).", "Your budget is $10.", "Unknown rejection."])("keeps ambiguous rejection unknown: %s", (message) => {
    expect(providerRejectionReason(message)).toBe("unknown");
  });
  it("distinguishes explicit content and access policies", () => {
    expect(providerRejectionReason("Request rejected by content moderation.")).toBe("content_policy");
    expect(providerRejectionReason("This model is not allowed for this key.")).toBe("access_policy");
  });
});
