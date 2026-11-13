import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const ledger = vi.hoisted(() => ({ available: true, calls: [] as Record<string, unknown>[], updates: [] as unknown[] }));
vi.mock("@/lib/db", () => ({ db: {
  insert: () => ({ values: (values: Record<string, unknown>) => ({ onConflictDoNothing: () => ({ returning: async () => {
    if (!ledger.available) throw new Error("Synthetic unavailable ledger");
    ledger.calls.push(values); return [{ ...values, startedAt: new Date() }];
  } }) }) }),
  update: () => ({ set: (values: Record<string, unknown>) => ({ where: () => {
    ledger.updates.push(values);
    return { then: (resolve: (value: undefined) => void) => resolve(undefined), returning: async () => [values] };
  } }) }),
} }));
import { suggestPhotoTitle } from "../lib/projects/naming";
import { callProviderJson } from "../lib/generation/provider-calls";
import { buildImageRequest } from "../lib/generation/request";

const base = "http://127.0.0.1:8082/api/v1";
const marker = "agentbridge_public_placeholder";
const context = { ownerId: "synthetic-owner", projectId: "synthetic-project" };
const network = vi.fn();

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("AGENTBRIDGE_BASE_URL", base);
  vi.stubEnv("AGENTBRIDGE_API_KEY", marker);
  network.mockReset(); ledger.calls = []; ledger.updates = []; ledger.available = true;
  vi.stubGlobal("fetch", network);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("actual provider clients and accounting contract", () => {
  it("routes naming through the guard after recording its cost entry", async () => {
    network.mockImplementation(async (url, init) => {
      expect(ledger.calls).toHaveLength(1);
      expect(String(url)).toBe(`${base}/chat/completions`);
      expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${marker}`);
      expect(JSON.parse(init.body).model).toBe("openrouter/openai/gpt-4.1-mini");
      expect(init.redirect).toBe("error");
      return Response.json({ choices: [{ message: { content: '{"title":"Synthetic ceramic mug"}' } }], usage: { cost: 0 } });
    });
    expect(await suggestPhotoTitle(Buffer.from("synthetic preview"), context)).toBe("Synthetic ceramic mug");
    expect(network).toHaveBeenCalledOnce();
  });
  it("routes the image request through the same guard and preserves attribution", async () => {
    network.mockImplementation(async (url, init) => {
      expect(ledger.calls[0]).toMatchObject({ ...context, purpose: "image", generationAttemptId: "synthetic-attempt" });
      expect(String(url)).toBe(`${base}/images`);
      expect(JSON.parse(init.body).model).toBe("openrouter/openai/gpt-image-2.6-flare");
      return Response.json({ data: [{ b64_json: "synthetic-only" }], usage: { cost: 0 } });
    });
    const request = buildImageRequest({ model: "openai/gpt-image-2.6-flare", shot: { label: "Front", azimuth: 0 }, referenceImages: ["data:image/webp;base64,c3ludGhldGlj"] });
    const result = await callProviderJson({ ...context, purpose: "image", generationAttemptId: "synthetic-attempt", endpoint: `${base}/images`, apiKey: marker, timeoutMs: 1000, body: { ...request, model: `openrouter/${request.model}` } });
    expect(result.ok).toBe(true); expect(network).toHaveBeenCalledOnce();
  });
  it("sends neither naming nor image requests when accounting is unavailable", async () => {
    ledger.available = false;
    expect(await suggestPhotoTitle(Buffer.from("synthetic"), context)).toBeNull();
    await expect(callProviderJson({ ...context, purpose: "image", generationAttemptId: "synthetic", endpoint: `${base}/images`, apiKey: marker, timeoutMs: 1000, body: { model: "synthetic" } })).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
});
