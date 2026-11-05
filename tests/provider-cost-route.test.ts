import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ report: vi.fn(), reconcile: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/generation/provider-calls", () => ({ projectProviderCosts: state.report, reconcileProviderCosts: state.reconcile }));
import { GET, POST } from "../app/api/internal/provider-costs/route";

const projectId = "5392ef6c-5eb7-4825-a44d-3eb4514ce359";
function request(token = "synthetic-operator") {
  return new Request(`https://reshoot.test/api/internal/provider-costs?projectId=${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
}
describe("operator provider-cost reporting", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", "synthetic-operator");
    state.report.mockResolvedValue({ knownCostMicros: 70000, totalCostMicros: null, unresolvedCalls: 1 });
    state.reconcile.mockResolvedValue({ checked: 1, resolved: 0 });
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each([GET, POST])("requires operator authorization even in development", async (handler) => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await handler(request("wrong"))).status).toBe(404);
    vi.stubEnv("CRON_SECRET", "");
    expect((await handler(request())).status).toBe(404);
    expect(state.report).not.toHaveBeenCalled(); expect(state.reconcile).not.toHaveBeenCalled();
  });
  it("GET reads costs without reconciliation and prevents caching", async () => {
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toMatchObject({ projectId, totalCostMicros: null, unresolvedCalls: 1 });
    expect(state.report).toHaveBeenCalledWith(projectId);
    expect(state.reconcile).not.toHaveBeenCalled();
  });
  it("POST requests only the bounded cost reconciliation for the named project", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(state.reconcile).toHaveBeenCalledWith(projectId);
    expect(state.report).toHaveBeenCalledWith(projectId);
  });
  it("rejects invalid IDs before reading any records", async () => {
    const result = await GET(new Request("https://reshoot.test/api/internal/provider-costs?projectId=bad", { headers: { Authorization: "Bearer synthetic-operator" } }));
    expect(result.status).toBe(400);
    expect(state.report).not.toHaveBeenCalled();
  });
});
