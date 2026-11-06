// Provider prices are USD. Reject missing/invalid values rather than coercing
// null, an empty string, false or a negative amount into a free request.
export function usdCostMicros(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return null;
  const amount = Number(value);
  const micros = Math.round(amount * 1_000_000);
  return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(micros) ? micros : null;
}

export function providerRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function providerIdentifier(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    && !/[\x00-\x1f\x7f]/.test(value) ? value : null;
}

export type ProviderCostRow = {
  id: string;
  purpose: "image" | "project_naming" | "rotation_review";
  state: string;
  usageCostMicros: number | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export function summarizeProviderCosts(rows: ProviderCostRow[]) {
  const knownCostMicros = rows.reduce((sum, row) => sum + (row.usageCostMicros ?? 0), 0);
  if (!Number.isSafeInteger(knownCostMicros)) throw new RangeError("Provider cost total exceeds safe precision.");
  const unresolvedCalls = rows.filter((row) => row.usageCostMicros === null).length;
  const pendingCalls = rows.filter((row) => row.state === "started").length;
  return {
    currency: "USD" as const,
    scope: "recorded_provider_calls" as const,
    calls: rows.length,
    knownCostMicros,
    // A subtotal with unknown calls is never represented as a final total.
    totalCostMicros: !rows.length || unresolvedCalls || pendingCalls ? null : knownCostMicros,
    unresolvedCalls,
    pendingCalls,
    imageCostMicros: rows.filter((row) => row.purpose === "image")
      .reduce((sum, row) => sum + (row.usageCostMicros ?? 0), 0),
    namingCostMicros: rows.filter((row) => row.purpose === "project_naming")
      .reduce((sum, row) => sum + (row.usageCostMicros ?? 0), 0),
    rotationReviewCostMicros: rows.filter((row) => row.purpose === "rotation_review")
      .reduce((sum, row) => sum + (row.usageCostMicros ?? 0), 0),
  };
}
