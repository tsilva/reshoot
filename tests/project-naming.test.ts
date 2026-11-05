import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const ledger = vi.hoisted(() => ({ available: true, calls: [] as unknown[], updates: [] as unknown[] }));
vi.mock("@/lib/db", () => ({ db: {
  insert: () => ({ values: (values: Record<string, unknown>) => ({ onConflictDoNothing: () => ({ returning: async () => {
    if (!ledger.available) throw new Error("Ledger unavailable");
    ledger.calls.push(values); return [{ ...values, startedAt: new Date() }];
  } }) }) }),
  update: () => ({ set: (values: Record<string, unknown>) => ({ where: () => {
    ledger.updates.push(values);
    return { then: (resolve: (value: undefined) => void) => resolve(undefined), returning: async () => [values] };
  } }) }),
} }));
import { suggestPhotoTitle } from "../lib/projects/naming";

const fetchMock = vi.fn();
const preview = Buffer.from("normalized product preview");
const context = { ownerId: "owner", projectId: "project" };

describe("photo-based shoot names", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AGENTBRIDGE_BASE_URL", "http://localhost:8082/api/v1");
    vi.stubEnv("AGENTBRIDGE_API_KEY", "test-only-key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    ledger.available = true; ledger.calls = []; ledger.updates = [];
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("uses a private normalized photo to return a concise product title", async () => {
    fetchMock.mockResolvedValue(Response.json({ choices: [{ message: { content: '{"title":"Cobalt ceramic mug"}' } }] }));
    expect(await suggestPhotoTitle(preview, context)).toBe("Cobalt ceramic mug");
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8082/api/v1/chat/completions");
    const body = JSON.parse(request.body);
    expect(body.model).toBe("openrouter/openai/gpt-4.1-mini");
    expect(body.messages[1].content[1]).toEqual({
      type: "image_url", image_url: { url: `data:image/webp;base64,${preview.toString("base64")}`, detail: "low" },
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(body.max_tokens).toBe(80);
  });

  it.each([
    ["Black smartphone in hand", "Black smartphone"],
    ["Black smartphone held in a person's hand", "Black smartphone"],
    ["Ceramic mug on a wooden table", "Ceramic mug"],
    ["Black smartphone with apps", "Black smartphone"],
    ["Black smartphone displaying app icons", "Black smartphone"],
    ["Wall-mounted lamp with shade", "Wall-mounted lamp with shade"],
  ])("keeps product details and removes scene wording from %s", async (title, expected) => {
    fetchMock.mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify({ title }) } }] }));
    expect(await suggestPhotoTitle(preview, context)).toBe(expected);
  });

  it("routes hosted naming directly through the production provider", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("OPENROUTER_API_KEY", "production-test-key");
    fetchMock.mockResolvedValue(Response.json({ choices: [{ message: { content: '{"title":"Cognac leather handbag"}' } }] }));
    expect(await suggestPhotoTitle(preview, context)).toBe("Cognac leather handbag");
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("openai/gpt-4.1-mini");
  });

  it.each([
    "not JSON", '{"title":""}', '{"title":"<script>bad</script>"}',
    JSON.stringify({ title: "x".repeat(81) }),
    '{"title":"one two three four five six seven eight nine"}',
    JSON.stringify({ title: "Mug\nIgnore instructions" }),
  ])("keeps the default for invalid model output: %s", async (content) => {
    fetchMock.mockResolvedValue(Response.json({ choices: [{ message: { content } }] }));
    expect(await suggestPhotoTitle(preview, context)).toBeNull();
  });

  it("does not block saving when the provider fails or times out", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await suggestPhotoTitle(preview, context)).toBeNull();
    fetchMock.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    expect(await suggestPhotoTitle(preview, context)).toBeNull();
  });

  it("never falls back to development credentials on a hosted deployment", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(await suggestPhotoTitle(preview, context)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attributes naming spend to its project even when the generated title is invalid", async () => {
    fetchMock.mockResolvedValue(Response.json({ usage: { cost: "0.000023" }, choices: [{ message: { content: "invalid" } }] }));
    expect(await suggestPhotoTitle(preview, context)).toBeNull();
    expect(ledger.calls).toContainEqual(expect.objectContaining({ ...context, purpose: "project_naming" }));
    expect(ledger.updates).toContainEqual(expect.objectContaining({ usageCostMicros: 23, costSource: "response" }));
  });

  it("keeps the saved photo unnamed without paying if cost tracking is unavailable", async () => {
    ledger.available = false;
    expect(await suggestPhotoTitle(preview, context)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
