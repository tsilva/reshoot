import { describe, expect, it } from "vitest";
import {
  protectedCreditsForReferences,
  roundUpToFive,
} from "../lib/pricing/calculator";

const initialPricing = {
  outputCostMicros: 211_000,
  textAllowanceMicros: 5_000,
  referenceAllowanceMicros: 52_000,
  providerFundingBps: 10_550,
  failureReserveBps: 10_500,
  grossMarginBps: 2_000,
  creditsPerUsd: 100,
};

describe("protected credit pricing", () => {
  it("reproduces every initial one-to-five-reference band", () => {
    expect(
      Array.from({ length: 5 }, (_, index) =>
        protectedCreditsForReferences(initialPricing, index + 1),
      ),
    ).toEqual([40, 45, 55, 60, 70]);
  });

  it("maintains at least a 20% gross margin after reserves", () => {
    for (let referenceCount = 1; referenceCount <= 5; referenceCount += 1) {
      const credits = protectedCreditsForReferences(initialPricing, referenceCount);
      const revenue = credits / 100;
      const protectedCost =
        ((initialPricing.outputCostMicros +
          initialPricing.textAllowanceMicros +
          referenceCount * initialPricing.referenceAllowanceMicros) /
          1_000_000) *
        (initialPricing.providerFundingBps / 10_000) *
        (initialPricing.failureReserveBps / 10_000);
      expect((revenue - protectedCost) / revenue).toBeGreaterThanOrEqual(0.2);
    }
  });

  it("rounds quotes upward in five-credit increments", () => {
    expect(roundUpToFive(40)).toBe(40);
    expect(roundUpToFive(40.001)).toBe(45);
  });

  it("rejects unsupported reference counts", () => {
    expect(() => protectedCreditsForReferences(initialPricing, 0)).toThrow();
    expect(() => protectedCreditsForReferences(initialPricing, 6)).toThrow();
  });
});
