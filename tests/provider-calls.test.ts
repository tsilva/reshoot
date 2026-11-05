import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  rows: new Map<string, Row>(), events: [] as string[], fetch: vi.fn(),
  insertFailure: false, mirrorFailure: false, warning: vi.fn(), selections: [] as SQL[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {
  insert: () => ({ values: (values: Row) => ({ onConflictDoNothing: () => ({ returning: async () => {
    if (state.insertFailure) throw new Error("Ledger unavailable");
    if (state.rows.has(String(values.id))) return [];
    const row: Row = { ...values, usageCostMicros: null, costSource: null, requestId: null, responseId: null,
      startedAt: new Date(), finishedAt: null, costCheckedAt: null };
    state.rows.set(String(row.id), row); state.events.push("insert"); return [row];
  } }) }) }),
  update: (table: Table) => ({ set: (values: Row) => ({ where: (condition: SQL) => {
    const apply = async () => {
      if (getTableName(table) !== "provider_calls") {
        if (state.mirrorFailure) throw new Error("Attempt update unavailable");
        return [];
      }
      const query = new PgDialect().sqlToQuery(condition);
      const row = state.rows.get(String(query.params[0]));
      if (!row || (query.sql.includes('"usage_cost_micros" is null') && row.usageCostMicros !== null)
        || (query.sql.includes('"state" =') && row.state !== query.params[1])) return [];
      Object.assign(row, values); state.events.push(values.costSource ? "cost" : "update"); return [row];
    };
    return { then: (resolve: (value: Row[]) => void, reject: (reason: unknown) => void) => apply().then(resolve, reject), returning: apply };
  } }) }),
  select: () => ({ from: () => ({ where: (condition: SQL) => {
    state.selections.push(condition);
    const query = new PgDialect().sqlToQuery(condition);
    const rows = [...state.rows.values()].filter((row) => row.projectId === query.params[0]);
    return { orderBy: () => ({ then: (resolve: (value: Row[]) => void) => Promise.resolve(rows).then(resolve), limit: async () => rows }) };
  } }) }),
} }));

import { callProviderJson, projectProviderCosts, reconcileProviderCosts } from "../lib/generation/provider-calls";

const context = { ownerId: "owner", projectId: "project", purpose: "image" as const, generationAttemptId: "attempt",
  endpoint: "https://openrouter.ai/api/v1/images", apiKey: "synthetic", body: { model: "openai/test-image" }, timeoutMs: 1000 };

describe("durable provider spend", () => {
  beforeEach(() => {
    state.rows.clear(); state.events = []; state.selections = []; state.insertFailure = false; state.mirrorFailure = false;
    state.fetch.mockReset(); state.warning.mockReset();
    vi.stubGlobal("fetch", state.fetch); vi.spyOn(console, "warn").mockImplementation(state.warning);
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("OPENROUTER_API_KEY", "synthetic");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("records identity before inference and persists cost before returning a malformed image", async () => {
    // The assertion below checks only ledger metadata, never prompt/image/key storage.
    state.fetch.mockImplementation(async () => {
      state.events.push("fetch");
      expect(state.rows.get("attempt")).toMatchObject({ requestedModel: "openai/test-image", state: "started" });
      return Response.json({ id: "gen-paid", model: "openai/actual-image", provider: "OpenAI", usage: { cost: "0.072345" }, data: [{ b64_json: "not an image" }] }, { headers: { "x-request-id": "request-header" } });
    });
    const response = await callProviderJson(context);
    expect(response.usageCostMicros).toBe(72345);
    expect(state.events.indexOf("insert")).toBeLessThan(state.events.indexOf("fetch"));
    expect(state.rows.get("attempt")).toMatchObject({ usageCostMicros: 72345, requestId: "request-header", responseId: "gen-paid",
      responseModel: "openai/actual-image", upstreamProvider: "OpenAI", state: "completed", costSource: "response" });
    expect(state.rows.get("attempt")).not.toHaveProperty("apiKey");
    expect(state.rows.get("attempt")).not.toHaveProperty("body");
    expect(state.fetch).toHaveBeenCalledOnce();
  });

  it("does not pay without a durable ledger and never replays an existing attempt", async () => {
    state.insertFailure = true;
    await expect(callProviderJson(context)).rejects.toThrow("Ledger unavailable");
    expect(state.fetch).not.toHaveBeenCalled();
    state.insertFailure = false;
    state.fetch.mockResolvedValue(Response.json({ usage: { cost: 0 } }));
    await callProviderJson(context);
    await expect(callProviderJson(context)).rejects.toThrow("not replayed");
    expect(state.fetch).toHaveBeenCalledOnce();
  });

  it("keeps cost and response identity even if updating legacy attempt accounting fails", async () => {
    state.mirrorFailure = true;
    state.fetch.mockResolvedValue(Response.json({ id: "gen-durable", usage: { cost: 0.07 } }));
    await expect(callProviderJson(context)).rejects.toThrow("Attempt update unavailable");
    expect(state.rows.get("attempt")).toMatchObject({ responseId: "gen-durable", usageCostMicros: 70000, state: "completed" });
    expect(state.fetch).toHaveBeenCalledOnce();
  });

  it("recovers interrupted completion after a cost commit without replaying inference or inventing duration", async () => {
    state.rows.set("attempt", { id: "attempt", projectId: "project", purpose: "image", state: "started",
      usageCostMicros: 70000, startedAt: new Date(Date.now() - 20 * 60_000), finishedAt: null, costCheckedAt: null });
    expect(await reconcileProviderCosts("project")).toEqual({ checked: 1, resolved: 0 });
    const report = await projectProviderCosts("project");
    expect(report).toMatchObject({ totalCostMicros: 70000, pendingCalls: 0 });
    expect(report.attempts[0]).toMatchObject({ state: "interrupted", durationMs: null });
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it.each([null, "", false, -0.1, "NaN"])("keeps invalid inline cost %s unresolved", async (cost) => {
    state.fetch.mockResolvedValue(Response.json({ usage: { cost } }));
    expect((await callProviderJson(context)).usageCostMicros).toBeUndefined();
    expect(state.rows.get("attempt")).toMatchObject({ usageCostMicros: null, costSource: null });
    expect(state.warning).toHaveBeenCalledWith("Provider cost unresolved", expect.any(Object));
  });

  it("records failed-provider spend rather than treating released credits as a refund from the provider", async () => {
    state.fetch.mockResolvedValue(Response.json({ usage: { cost: 0.03 } }, { status: 500 }));
    expect(await callProviderJson(context)).toMatchObject({ ok: false, status: 500, usageCostMicros: 30000 });
    expect(state.rows.get("attempt")).toMatchObject({ state: "http_error", usageCostMicros: 30000 });
  });

  it("preserves response headers when parsing fails", async () => {
    state.fetch.mockResolvedValue(new Response("truncated", { headers: { "x-request-id": "req-kept" } }));
    expect(await callProviderJson(context)).toMatchObject({ result: null, providerRequestId: "req-kept" });
    expect(state.rows.get("attempt")).toMatchObject({ state: "invalid_response", requestId: "req-kept", usageCostMicros: null });
  });

  it("retains an unresolved call on timeout without recording credentials or raw errors", async () => {
    state.fetch.mockRejectedValue(new Error("Synthetic sensitive provider failure"));
    await expect(callProviderJson(context)).rejects.toThrow("cost remains unresolved");
    expect(state.rows.get("attempt")).toMatchObject({ state: "transport_error", usageCostMicros: null });
    expect(JSON.stringify([...state.rows.values()])).not.toContain("sensitive");
  });

  it("recovers missing usage with one matching metadata GET, including an explicit zero", async () => {
    state.fetch.mockResolvedValueOnce(Response.json({ id: "gen-recover" }))
      .mockResolvedValueOnce(Response.json({ data: { id: "gen-recover", total_cost: 0, model: "openai/resolved", provider_name: "OpenAI" } }));
    expect((await callProviderJson(context)).usageCostMicros).toBe(0);
    expect(state.rows.get("attempt")).toMatchObject({ usageCostMicros: 0, costSource: "generation_lookup", responseModel: "openai/resolved" });
    expect(state.fetch.mock.calls[1][0]).toBe("https://openrouter.ai/api/v1/generation?id=gen-recover");
    expect(state.fetch.mock.calls[1][1].method).toBeUndefined();
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["wrong ID", "unavailable"])("keeps an unresolved cost if history returns %s", async (scenario) => {
    state.fetch.mockResolvedValueOnce(Response.json({ id: "gen-recover" }))
      .mockResolvedValueOnce(scenario === "wrong ID" ? Response.json({ data: { id: "gen-other", total_cost: 0.2 } }) : new Response(null, { status: 404 }));
    expect((await callProviderJson(context)).usageCostMicros).toBeUndefined();
    expect(state.rows.get("attempt")?.usageCostMicros).toBeNull();
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not send an AgentBridge credential to OpenRouter for cost lookup", async () => {
    state.fetch.mockResolvedValue(Response.json({ id: "gen-gateway" }));
    await callProviderJson({ ...context, endpoint: "http://127.0.0.1:8082/api/v1/images" });
    expect(state.fetch).toHaveBeenCalledOnce();
  });

  it("reports mixed spend and retries history without another inference request", async () => {
    state.fetch.mockResolvedValueOnce(Response.json({ id: "gen-recover" }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    await callProviderJson(context);
    const row = state.rows.get("attempt")!;
    row.costCheckedAt = null;
    expect(await projectProviderCosts("project")).toMatchObject({ totalCostMicros: null, unresolvedCalls: 1 });
    state.fetch.mockResolvedValueOnce(Response.json({ data: { id: "gen-recover", total_cost: 0.08 } }));
    expect(await reconcileProviderCosts("project")).toEqual({ checked: 1, resolved: 1 });
    expect(await projectProviderCosts("project")).toMatchObject({ totalCostMicros: 80000, unresolvedCalls: 0 });
    expect(state.fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
    const query = new PgDialect().sqlToQuery(state.selections[1]);
    expect(query.sql).toContain('"usage_cost_micros" is null');
    expect(query.params).toContain("project");
  });
});
