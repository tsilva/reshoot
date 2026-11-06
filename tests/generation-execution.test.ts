import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { QuoteShotInput } from "../lib/db/schema";
const state = vi.hoisted(() => ({
  attemptState: "claimed", providerModel: "openai/gpt-image-2.6-sunburst", transitionWon: true, inputs: ["primary", "supporting"],
  quoteShots: [] as Array<{ orientationGuideKind: NonNullable<QuoteShotInput["orientationGuideKind"]>; rotationPolicy?: "verified-rotation-v1" }>,
  azimuth: 90,
  getObjectBuffer: vi.fn(), headObject: vi.fn(), putObject: vi.fn(),
  capture: vi.fn(), release: vi.fn(), fetch: vi.fn(), updates: [] as unknown[],
  calls: [] as unknown[], ledgerAvailable: true,
}));
vi.mock("server-only", () => ({}));
vi.mock("workflow", () => ({ RetryableError: Error }));
vi.mock("@/lib/generation/provider", () => ({ imageProviderConfig: { model: "openai/gpt-image-2.6-sunburst", endpoint: "https://new.example/images", referer: "https://reshoot.tsilva.eu", title: "Reshoot" }, requireImageProviderKey: () => "dummy" }));
vi.mock("@/lib/generation/accounting", () => ({ captureGeneration: state.capture, releaseGeneration: state.release }));
vi.mock("@/lib/storage/r2", () => ({ getObjectBuffer: state.getObjectBuffer, headObject: state.headObject, putObject: state.putObject, sha256Hex: () => "checksum" }));
vi.mock("@/lib/db", () => ({ db: {
  query: {
    generationJobs: { findFirst: async () => ({ id: "job", status: "running", ownerId: "owner", version: 1 }) },
    generationAttempts: { findFirst: async () => ({ id: "attempt", state: state.attemptState, providerModel: state.providerModel, providerEndpoint: "https://pinned.example/images", outputR2Key: "output", previewR2Key: "preview" }) },
  },
  select: (selection?: unknown) => ({ from: () => ({
    innerJoin: () => ({ innerJoin: () => ({ innerJoin: () => ({
      where: () => ({ limit: async () => [{
        shot: { id: "shot", projectId: "project", label: "Profile", azimuth: state.azimuth, elevation: 0 },
        quoteShots: state.quoteShots,
      }] }),
    }) }) }),
    where: () => ({ orderBy: async () => selection ? [] : state.inputs.map((frozenR2Key) => ({ frozenR2Key })) }),
  }) }),
  insert: () => ({ values: (values: Record<string, unknown>) => ({ onConflictDoNothing: () => ({ returning: async () => {
    if (!state.ledgerAvailable) throw new Error("Ledger unavailable");
    state.calls.push(values); return [{ ...values, startedAt: new Date() }];
  } }) }) }),
  update: () => ({ set: (values: Record<string, unknown>) => { state.updates.push(values); return { where: () => ({ then: (resolve: (value: undefined) => void) => resolve(undefined), returning: async () => state.transitionWon ? [{ id: "attempt", ...values }] : [] }) }; } }),
} }));
import { executeGenerationJob } from "../workflows/generation/steps";

describe("durable generation dispatch", () => {
  beforeEach(() => {
    state.attemptState = "claimed"; state.providerModel = "openai/gpt-image-2.6-sunburst"; state.transitionWon = true; state.inputs = ["primary", "supporting"]; state.updates = []; state.quoteShots = [];
    state.calls = []; state.ledgerAvailable = true;
    state.azimuth = 90;
    vi.clearAllMocks();
    state.headObject.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
    state.getObjectBuffer.mockImplementation(async (key) => Buffer.from(key));
    vi.stubGlobal("fetch", state.fetch);
  });

  it.each(["left", "right", "unavailable", "malformed"])("reviews a new left profile before storage (%s)", async (side) => {
    state.azimuth = 270;
    state.quoteShots = [{ orientationGuideKind: "direction-frame-v1", rotationPolicy: "verified-rotation-v1" }];
    const png = await sharp(Buffer.from('<svg width="512" height="512"><rect x="90" y="60" width="80" height="390" fill="black"/></svg>')).png().toBuffer();
    state.fetch.mockResolvedValueOnce(Response.json({ data: [{ b64_json: png.toString("base64") }], usage: { cost: .07 } }))
      .mockResolvedValueOnce(side === "unavailable" ? new Response(null, { status: 503 }) : Response.json({
        choices: [{ message: { content: side === "malformed" ? "not JSON" : JSON.stringify({
          confident: true, same_product: true, rigid_pose: true, front_visible: false, rear_visible: false,
          physical_side: side, evidence: "Asymmetric landmarks identify the observed physical side.",
        }) } }], usage: { cost: .001 },
      }));
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: side === "left" ? "succeeded" : "failed" });
    expect(state.fetch).toHaveBeenCalledTimes(2);
    const requests = state.fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(requests[0].prompt).toContain("visible physical side LEFT");
    expect(requests[1].model).toBe("openrouter/openai/gpt-4.1-mini");
    expect(requests[1].messages[1].content.filter((item: { type: string }) => item.type === "image_url")).toHaveLength(4);
    expect(state.calls).toEqual([
      expect.objectContaining({ purpose: "image", generationAttemptId: "attempt" }),
      expect.objectContaining({ purpose: "rotation_review", generationAttemptId: "attempt" }),
    ]);
    if (side === "left") {
      expect(state.capture).toHaveBeenCalledWith(expect.objectContaining({ usageCostMicros: 70000 }));
      expect(state.release).not.toHaveBeenCalled();
    } else {
      expect(state.putObject).not.toHaveBeenCalled();
      expect(state.capture).not.toHaveBeenCalled();
      expect(state.release).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "invalid_rotation_output", usageCostMicros: 70000 }));
    }
  });

  it.each(["openai/gpt-image-2.6-sunburst", "openai/gpt-image-2.6-flare", "openai/gpt-image-2.5-sunburst"])("dispatches the recorded model %s through the current gateway, persists an image, then captures credits", async (model) => {
    state.providerModel = model;
    const png = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{
      input: { create: { width: 8, height: 8, channels: 3, background: "blue" } },
      gravity: "centre",
    }]).png().toBuffer();
    state.fetch.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }], usage: { cost: 0.07 } }), { headers: { "x-request-id": "request" } }));
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: "succeeded" });
    expect(state.fetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = state.fetch.mock.calls[0];
    expect(endpoint).toBe("https://new.example/images");
    const body = JSON.parse(options.body);
    expect(body.background).toBe("transparent");
    expect(body.model).toBe(`openrouter/${model}`);
    expect(body.quality).toBe("high");
    if (model === "openai/gpt-image-2.6-sunburst") {
      expect(body.provider).toEqual({ options: { openai: { complexity: "high" } } });
    } else {
      expect(body).not.toHaveProperty("provider");
    }
    expect(body.prompt).toContain("RIGHT PROFILE view");
    expect(body.input_references.slice(0, 2).map((item: { image_url: { url: string } }) => item.image_url.url)).toEqual(["primary", "supporting"].map((key) => `data:image/webp;base64,${Buffer.from(key).toString("base64")}`));
    expect(body.input_references).toHaveLength(3);
    expect(state.getObjectBuffer.mock.calls.map(([key]) => key)).toEqual(["primary", "supporting"]);
    const guide = body.input_references[2].image_url.url;
    expect(guide).toMatch(/^data:image\/png;base64,/);
    expect(await sharp(Buffer.from(guide.split(",")[1], "base64")).metadata()).toMatchObject({ format: "png", width: 512, height: 512 });
    expect(body.prompt).toContain("REFERENCE 2 is a supporting original");
    expect(body.prompt).toContain("REFERENCE 3 is an annotated coordinate frame");
    expect(body.prompt).not.toContain("REFERENCE 3 is a supporting original");
    expect(state.updates).toContainEqual(expect.objectContaining({ providerRequestId: "request", usageCostMicros: 70000 }));
    expect(state.putObject).toHaveBeenCalledTimes(2);
    expect(state.putObject).toHaveBeenCalledWith(expect.objectContaining({ key: "output", body: png }));
    const preview = state.putObject.mock.calls.find(([object]) => object.key === "preview")?.[0].body;
    expect((await sharp(preview).stats()).isOpaque).toBe(false);
    expect(state.capture).toHaveBeenCalledWith(expect.objectContaining({ usageCostMicros: 70000, providerRequestId: "request", output: expect.objectContaining({ ownerId: "owner", mimeType: "image/png", width: 16, height: 16 }) }));
    expect(state.release).not.toHaveBeenCalled();
  });

  it.each(["generic-cup-v1", "upright-mug-v1", "upright-phone-v1", "upright-phone-v2"] as const)("uses the generic frame even for legacy quote kind %s", async (kind) => {
    state.quoteShots = [{ orientationGuideKind: kind }];
    const png = await sharp(Buffer.from('<svg width="256" height="256"><rect x="78" y="28" width="100" height="200" fill="blue"/></svg>')).png().toBuffer();
    state.fetch.mockResolvedValue(Response.json({ data: [{ b64_json: png.toString("base64") }] }));
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: "succeeded" });
    const prompt = JSON.parse(state.fetch.mock.calls[0][1].body).prompt;
    expect(prompt).toContain("annotated coordinate frame");
    expect(prompt).not.toMatch(/\b(?:watch|mug|cup|phone|doll)\b/i);
    expect(state.fetch).toHaveBeenCalledOnce();
  });

  it("releases the held credit when the provider returns an opaque output", async () => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: "white" } }).png().toBuffer();
    state.fetch.mockResolvedValue(new Response(JSON.stringify({
      id: "opaque-request", data: [{ b64_json: png.toString("base64") }], usage: { cost: 0.07 },
    })));
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: "failed" });
    expect(state.fetch).toHaveBeenCalledTimes(1);
    expect(state.putObject).not.toHaveBeenCalled();
    expect(state.capture).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledWith(expect.objectContaining({
      attemptState: "failed", failureCode: "invalid_transparent_output",
      providerRequestId: "opaque-request", usageCostMicros: 70000,
    }));
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

  it("does not pay if the attempt ended while references were loading", async () => {
    state.transitionWon = false;
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: "duplicate" });
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.capture).not.toHaveBeenCalled();
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

  it("does not send paid inference if the cost ledger cannot be opened", async () => {
    state.ledgerAvailable = false;
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: "failed" });
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.capture).not.toHaveBeenCalled();
  });

  it.each(["invalid image", "storage failure"])("preserves paid usage after %s", async (failure) => {
    const png = failure === "invalid image" ? Buffer.from("invalid raster") : await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{ input: { create: { width: 8, height: 8, channels: 3, background: "blue" } }, gravity: "centre" }]).png().toBuffer();
    state.fetch.mockResolvedValue(Response.json({ id: "paid-response", data: [{ b64_json: png.toString("base64") }], usage: { cost: 0.071 } }));
    if (failure === "storage failure") state.putObject.mockRejectedValueOnce(new Error("Storage unavailable"));
    expect(await executeGenerationJob("job", "attempt", "lease")).toEqual({ status: "failed" });
    expect(state.updates).toContainEqual(expect.objectContaining({ usageCostMicros: 71000, costSource: "response" }));
    expect(state.release).toHaveBeenCalledWith(expect.objectContaining({ providerRequestId: "paid-response", usageCostMicros: 71000 }));
    expect(state.fetch).toHaveBeenCalledOnce();
  });
});
