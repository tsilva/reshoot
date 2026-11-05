import { describe, expect, it } from "vitest";
import { summarizeProviderCosts, usdCostMicros } from "../lib/generation/provider-cost";

describe("provider cost accounting", () => {
  it.each([null, undefined, "", " ", false, true, -1, "-0.2", Infinity, NaN, {}, "NaN", "0x10", 1e20])(
    "does not interpret invalid or absent usage %s as free inference", (value) => {
      expect(usdCostMicros(value)).toBeNull();
    },
  );
  it.each([[0, 0], ["0", 0], ["0.071234", 71234], [0.12, 120000], ["2e-5", 20]])(
    "converts provider-reported USD %s to %s micros", (value, expected) => {
      expect(usdCostMicros(value)).toBe(expected);
    },
  );
  const row = { id: "call", purpose: "image" as const, state: "completed", startedAt: new Date(), finishedAt: new Date() };
  it("includes failed image calls and naming spend in the total", () => {
    expect(summarizeProviderCosts([
      { ...row, usageCostMicros: 70000 },
      { ...row, id: "rejected", state: "http_error", usageCostMicros: 40000 },
      { ...row, id: "title", purpose: "project_naming", usageCostMicros: 23 },
    ])).toMatchObject({ calls: 3, totalCostMicros: 110023, imageCostMicros: 110000, namingCostMicros: 23, unresolvedCalls: 0 });
  });
  it("returns a known subtotal but no final total when any cost is missing", () => {
    expect(summarizeProviderCosts([{ ...row, usageCostMicros: 70000 }, { ...row, usageCostMicros: null }]))
      .toMatchObject({ knownCostMicros: 70000, totalCostMicros: null, unresolvedCalls: 1 });
    expect(summarizeProviderCosts([]).totalCostMicros).toBeNull();
  });
  it("distinguishes a reported zero from pending work", () => {
    expect(summarizeProviderCosts([{ ...row, usageCostMicros: 0 }]).totalCostMicros).toBe(0);
    expect(summarizeProviderCosts([{ ...row, state: "started", usageCostMicros: null }]))
      .toMatchObject({ pendingCalls: 1, totalCostMicros: null });
  });
});
