import "server-only";

import { and, asc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { generationAttempts, providerCalls } from "@/lib/db/schema";
import { providerApiKey, usesProductionProvider } from "@/lib/generation/agentbridge";
import { providerIdentifier, providerRecord, summarizeProviderCosts, usdCostMicros } from "@/lib/generation/provider-cost";

type ProviderCall = typeof providerCalls.$inferSelect;
type CallContext = {
  ownerId: string;
  projectId: string;
  purpose: "image" | "project_naming" | "rotation_review";
  generationAttemptId?: string;
};

function providerName(endpoint: string) {
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("Invalid provider endpoint.");
  }
  return url.origin === "https://openrouter.ai" ? "openrouter" : "agentbridge";
}

async function saveCost(call: Pick<ProviderCall, "id" | "generationAttemptId" | "purpose">, patch: {
  usageCostMicros: number;
  costSource: "response" | "generation_lookup";
  responseModel?: string | null;
  upstreamProvider?: string | null;
  responseId?: string | null;
  state?: ProviderCall["state"];
  finishedAt?: Date;
}) {
  // Commit provider spend independently before image decoding/storage/credits.
  // An existing reported amount cannot be replaced by missing or stale usage.
  const [saved] = await db.update(providerCalls).set({ ...patch, costCheckedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(providerCalls.id, call.id), isNull(providerCalls.usageCostMicros)))
    .returning({ usageCostMicros: providerCalls.usageCostMicros });
  if (saved && call.purpose === "image" && call.generationAttemptId && patch.usageCostMicros <= 2_147_483_647) {
    await db.update(generationAttempts).set({ usageCostMicros: saved.usageCostMicros, updatedAt: new Date() })
      .where(eq(generationAttempts.id, call.generationAttemptId));
  }
  return saved?.usageCostMicros ?? null;
}

// Read-only, bounded metadata lookup. Never replay inference to obtain a price,
// and never send a gateway credential to an upstream OpenRouter endpoint.
async function lookupCost(call: Pick<ProviderCall, "id" | "endpoint" | "responseId" | "requestId" | "generationAttemptId" | "purpose">, apiKey: string) {
  await db.update(providerCalls).set({ costCheckedAt: new Date(), updatedAt: new Date() }).where(eq(providerCalls.id, call.id));
  let endpoint: URL;
  try { endpoint = new URL(call.endpoint); } catch { return null; }
  if (endpoint.origin !== "https://openrouter.ai"
    || !["/api/v1/images", "/api/v1/chat/completions"].includes(endpoint.pathname)
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null;
  const generationId = [call.responseId, call.requestId].find((id) => id && /^gen-[a-zA-Z0-9_-]{1,200}$/.test(id));
  if (!generationId) return null;
  let result: Record<string, unknown>;
  try {
    const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
      redirect: "error",
    });
    if (!response.ok) return null;
    result = providerRecord(providerRecord(await response.json()).data);
  } catch {
    return null;
  }
  // Do not attach another generation's charge to this shoot.
  if (result.id !== generationId) return null;
  const usageCostMicros = usdCostMicros(result.total_cost);
  if (usageCostMicros === null) return null;
  await saveCost(call, { usageCostMicros, costSource: "generation_lookup",
    responseModel: providerIdentifier(result.model), upstreamProvider: providerIdentifier(result.provider_name) });
  // A process can die after saving HTTP headers. A successful history lookup
  // resolves its spend without inventing an observed finish time or output.
  await db.update(providerCalls).set({ state: "interrupted", updatedAt: new Date() })
    .where(and(eq(providerCalls.id, call.id), eq(providerCalls.state, "started")));
  return usageCostMicros;
}

export async function callProviderJson(input: CallContext & {
  endpoint: string;
  apiKey: string;
  body: Record<string, unknown> & { model: string };
  headers?: Record<string, string>;
  timeoutMs: number;
}) {
  if ((input.purpose !== "project_naming") !== Boolean(input.generationAttemptId)) throw new Error("Invalid provider call attribution.");
  const provider = providerName(input.endpoint);
  const id = input.purpose === "image" ? input.generationAttemptId! : crypto.randomUUID();
  // Serialization and credential resolution happen before marking paid work.
  const body = JSON.stringify(input.body);
  const [call] = await db.insert(providerCalls).values({
    id, ownerId: input.ownerId, projectId: input.projectId,
    generationAttemptId: input.generationAttemptId, purpose: input.purpose,
    provider, endpoint: input.endpoint, requestedModel: input.body.model, state: "started",
  }).onConflictDoNothing().returning();
  if (!call) throw new Error("Provider call has already been recorded; inference was not replayed.");

  let response: Response;
  try {
    response = await fetch(input.endpoint, {
      method: "POST",
      headers: { ...input.headers, Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body, signal: AbortSignal.timeout(input.timeoutMs), redirect: "error",
    });
  } catch {
    await db.update(providerCalls).set({ state: "transport_error", finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(providerCalls.id, id));
    console.warn("Provider cost unresolved", { providerCallId: id, purpose: input.purpose });
    throw new Error("Provider request did not complete; its cost remains unresolved.");
  }

  const requestId = providerIdentifier(response.headers.get("x-request-id"));
  // Persist headers even if the response body is truncated or cannot be parsed.
  await db.update(providerCalls).set({ requestId, httpStatus: response.status, respondedAt: new Date(), updatedAt: new Date() })
    .where(eq(providerCalls.id, id));
  let result: Record<string, unknown> | null = null;
  try {
    const value: unknown = await response.json();
    if (value && typeof value === "object" && !Array.isArray(value)) result = providerRecord(value);
  } catch { /* Preserve an explicit unknown cost for an unreadable response. */ }
  const responseId = providerIdentifier(result?.id);
  const responseModel = providerIdentifier(result?.model);
  const upstreamProvider = providerIdentifier(result?.provider);
  const reported = usdCostMicros(providerRecord(result?.usage).cost);
  const completion = {
    responseId, responseModel, upstreamProvider,
    state: (result === null ? "invalid_response" : response.ok ? "completed" : "http_error") as ProviderCall["state"],
    finishedAt: new Date(),
  };
  // Save financial data before accepting, decoding or rejecting any output.
  // Commit response identity and cost together, so a later failure cannot lose
  // the generation ID needed for financial reconciliation.
  if (reported !== null) await saveCost(call, { ...completion, usageCostMicros: reported, costSource: "response" });
  else await db.update(providerCalls).set({ ...completion, updatedAt: new Date() }).where(eq(providerCalls.id, id));
  const usageCostMicros = reported ?? await lookupCost({ ...call, requestId, responseId }, input.apiKey);
  if (usageCostMicros === null) console.warn("Provider cost unresolved", { providerCallId: id, purpose: input.purpose });
  return { ok: response.ok, status: response.status, result,
    providerRequestId: requestId ?? responseId ?? undefined, usageCostMicros: usageCostMicros ?? undefined };
}

export async function reconcileProviderCosts(projectId: string, limit = 25) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Invalid reconciliation limit.");
  const calls = await db.select().from(providerCalls).where(and(
    eq(providerCalls.projectId, projectId),
    or(isNull(providerCalls.usageCostMicros), eq(providerCalls.state, "started")),
    or(ne(providerCalls.state, "started"), lt(providerCalls.startedAt, new Date(Date.now() - 10 * 60_000))),
    or(isNull(providerCalls.costCheckedAt), lt(providerCalls.costCheckedAt, new Date(Date.now() - 60_000))),
  )).orderBy(sql`${providerCalls.costCheckedAt} asc nulls first`, asc(providerCalls.startedAt)).limit(limit);
  let resolved = 0;
  if (calls.length) {
    for (const call of calls) {
      if (call.usageCostMicros !== null) {
        // Recover a crash after usage was committed but before the final state.
        await db.update(providerCalls).set({ state: "interrupted", updatedAt: new Date() })
          .where(and(eq(providerCalls.id, call.id), eq(providerCalls.state, "started")));
        continue;
      }
      if (call.provider !== "openrouter") {
        await db.update(providerCalls).set({ costCheckedAt: new Date(), updatedAt: new Date() }).where(eq(providerCalls.id, call.id));
        continue;
      }
      // Local AgentBridge credentials must never be used for upstream history.
      if (!usesProductionProvider()) throw new Error("Upstream cost reconciliation requires the hosted provider route.");
      if (await lookupCost(call, providerApiKey()) !== null) resolved++;
    }
  }
  return { checked: calls.length, resolved };
}

export async function projectProviderCosts(projectId: string) {
  const calls = await db.select().from(providerCalls).where(eq(providerCalls.projectId, projectId))
    .orderBy(asc(providerCalls.startedAt));
  return { ...summarizeProviderCosts(calls), attempts: calls.map((call) => ({
    id: call.id, generationAttemptId: call.generationAttemptId, purpose: call.purpose,
    provider: call.provider, requestedModel: call.requestedModel, responseModel: call.responseModel,
    upstreamProvider: call.upstreamProvider, requestId: call.requestId, responseId: call.responseId,
    state: call.state, httpStatus: call.httpStatus, usageCostMicros: call.usageCostMicros,
    costSource: call.costSource, startedAt: call.startedAt, finishedAt: call.finishedAt,
    respondedAt: call.respondedAt, costCheckedAt: call.costCheckedAt,
    durationMs: call.finishedAt ? Math.max(0, call.finishedAt.getTime() - call.startedAt.getTime()) : null,
  })) };
}
