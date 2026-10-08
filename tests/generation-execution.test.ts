import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
const state = vi.hoisted(() => ({
  attemptState: "claimed", inputs: ["primary", "supporting"],
  getObjectBuffer: vi.fn(), headObject: vi.fn(), putObject: vi.fn(),
  capture: vi.fn(), release: vi.fn(), fetch: vi.fn(), updates: [] as unknown[],
}));
vi.mock("server-only", () => ({}));
vi.mock("workflow", () => ({ RetryableError: Error }));
vi.mock("@/lib/generation/provider", () => ({ imageProviderConfig: { model: "openai/gpt-image-2.5-flare", endpoint: "https://new.example/images", referer: "https://reshoot.tsilva.eu", title: "Reshoot" }, requireImageProviderKey: () => "dummy" }));
vi.mock("@/lib/generation/accounting", () => ({ captureGeneration: state.capture, releaseGeneration: state.release }));
vi.mock("@/lib/storage/r2", () => ({ getObjectBuffer: state.getObjectBuffer, headObject: state.headObject, putObject: state.putObject, sha256Hex: () => "checksum" }));
vi.mock("@/lib/db", () => ({ db: {
  query: {
    generationJobs: { findFirst: async () => ({ id: "job", status: "running", ownerId: "owner", version: 1 }) },
    generationAttempts: { findFirst: async () => ({ id: "attempt", state: state.attemptState, providerModel: "openai/gpt-image-2.5-sunburst", providerEndpoint: "https://pinned.example/images", outputR2Key: "output", previewR2Key: "preview" }) },
  },
  select: (selection?: unknown) => ({ from: () => ({
    innerJoin: () => ({ where: () => ({ limit: async () => [{ shot: { id: "shot", projectId: "project", label: "Right profile", azimuth: 90, elevation: 0 } }] }) }),
    where: () => ({ orderBy: async () => selection ? [] : state.inputs.map((frozenR2Key) => ({ frozenR2Key })) }),
  }) }),
  update: () => ({ set: (values: unknown) => { state.updates.push(values); return { where: async () => undefined }; } }),
} }));
import { executeGenerationJob } from "../workflows/generation/steps";

describe("durable generation dispatch", () => {
  beforeEach(() => {
    state.attemptState = "claimed"; state.inputs = ["primary", "supporting"]; state.updates = [];
    vi.clearAllMocks();
    state.headObject.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
    state.getObjectBuffer.mockImplementation(async (key) => Buffer.from(key));
    vi.stubGlobal("fetch", state.fetch);
  });

  it("uses the recorded model and endpoint after config changes, persists an image, then captures credits", async () => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
    state.fetch.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }], usage: { cost: 0.07 } }), { headers: { "x-request-id": "request" } }));
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: "succeeded" });
    expect(state.fetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = state.fetch.mock.calls[0];
    expect(endpoint).toBe("https://pinned.example/images");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("openai/gpt-image-2.5-sunburst");
    expect(body.prompt).toContain("RIGHT PROFILE view");
    expect(body.input_references.map((item: { image_url: { url: string } }) => item.image_url.url)).toEqual(["primary", "supporting"].map((key) => `data:image/webp;base64,${Buffer.from(key).toString("base64")}`));
    expect(state.updates).toContainEqual(expect.objectContaining({ providerRequestId: "request", usageCostMicros: 70000 }));
    expect(state.putObject).toHaveBeenCalledTimes(2);
    expect(state.capture).toHaveBeenCalledWith(expect.objectContaining({ usageCostMicros: 70000, providerRequestId: "request", output: expect.objectContaining({ ownerId: "owner", mimeType: "image/png", width: 16, height: 16 }) }));
    expect(state.release).not.toHaveBeenCalled();
  });

  it("recovers persisted output without another paid request", async () => {
    state.attemptState = "started";
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
    state.headObject.mockResolvedValue({});
    state.getObjectBuffer.mockResolvedValue(png);
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: "recovered" });
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.capture).toHaveBeenCalledTimes(1);
    expect(state.release).not.toHaveBeenCalled();
  });

  it("releases a replayed started attempt without a second paid request", async () => {
    state.attemptState = "started";
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: "ambiguous" });
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledWith(expect.objectContaining({ attemptState: "ambiguous" }));
  });

  it("fails missing originals before marking a provider request started", async () => {
    state.inputs = [];
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: "failed" });
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
    expect(state.release).toHaveBeenCalledWith(expect.objectContaining({ attemptState: "failed" }));
  });
});
