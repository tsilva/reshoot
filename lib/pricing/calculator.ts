export type ProtectedPriceInput = {
  outputCostMicros: number;
  textAllowanceMicros: number;
  referenceAllowanceMicros: number;
  providerFundingBps: number;
  failureReserveBps: number;
  grossMarginBps: number;
  creditsPerUsd: number;
};

export function roundUpToFive(value: number) {
  return Math.ceil(value / 5) * 5;
}

export function protectedCreditsForReferences(
  input: ProtectedPriceInput,
  referenceCount: number,
) {
  if (!Number.isInteger(referenceCount) || referenceCount < 1 || referenceCount > 5) {
    throw new RangeError("Reference count must be between one and five.");
  }
  const baseMicros =
    input.outputCostMicros +
    input.textAllowanceMicros +
    referenceCount * input.referenceAllowanceMicros;
  const protectedMicros =
    baseMicros *
    (input.providerFundingBps / 10_000) *
    (input.failureReserveBps / 10_000);
  const saleMicros = protectedMicros / (1 - input.grossMarginBps / 10_000);
  return roundUpToFive((saleMicros / 1_000_000) * input.creditsPerUsd);
}

export function protectedCreditsFromRealizedCost(
  averageCostMicros: number,
  input: Pick<
    ProtectedPriceInput,
    "failureReserveBps" | "grossMarginBps" | "creditsPerUsd"
  >,
) {
  const protectedMicros = averageCostMicros * (input.failureReserveBps / 10_000);
  const saleMicros = protectedMicros / (1 - input.grossMarginBps / 10_000);
  return roundUpToFive((saleMicros / 1_000_000) * input.creditsPerUsd);
}
