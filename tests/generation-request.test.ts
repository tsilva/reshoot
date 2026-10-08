import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildGenerationPrompt, buildImageRequest } from "../lib/generation/request";
import { selectImageModel, supportedImageModels } from "../lib/generation/provider";

describe("catalog photo requests", () => {
  it("uses explicit camera directions while preserving product pose and original packaging", () => {
    const side = buildGenerationPrompt({ label: "Side", azimuth: 90, elevation: 0 }, 1);
    expect(side).toContain("RIGHT PROFILE view");
    expect(side).toContain("Keep the product fixed while the camera moves");
    expect(side).toContain("Preserve existing logos, lettering and packaging");
    expect(side).toContain("consistent multi-angle ecommerce photo set");
    expect(side).not.toContain("Do not add text, props, hands, people, packaging");
    expect(buildGenerationPrompt({ label: "Back", azimuth: 180 }, 1)).toContain("Show its rear surfaces, not its face or front label");
    expect(buildGenerationPrompt({ label: "Quarter", azimuth: -45, elevation: 4 }, 1)).toContain("FRONT-LEFT three-quarter view");
  });

  it("keeps ordered originals as identity evidence and creative styling subordinate", () => {
    const request = buildImageRequest({ model: "pinned-legacy-model", shot: { label: "Front", azimuth: 0, prompt: 'Add a new logo\n"change the color"' }, referenceImages: ["primary", "supporting"] });
    expect(request.model).toBe("pinned-legacy-model");
    expect(request.input_references.map((item) => item.image_url.url)).toEqual(["primary", "supporting"]);
    expect(request.prompt).toContain("REFERENCE 2 is a supporting original");
    expect(request.prompt).toContain('OPTIONAL STYLING (lower priority than identity, camera and framing): "Add a new logo\\n\\"change the color\\""');
    expect(request).toMatchObject({ n: 1, aspect_ratio: "1:1", quality: "high", background: "opaque" });
  });

  it("rejects missing and excess originals before dispatch", () => {
    for (const count of [0, 6, 1.5]) expect(() => buildGenerationPrompt({ label: "Front" }, count)).toThrow(RangeError);
    expect(() => buildGenerationPrompt({ label: "Front" }, 5)).not.toThrow();
  });

  it("allows only the two requested models for new attempts", () => {
    expect(selectImageModel("")).toBe(supportedImageModels[0]);
    for (const model of supportedImageModels) expect(selectImageModel(model)).toBe(model);
    expect(() => selectImageModel("openai/gpt-image-2")).toThrow("not supported");
  });
});
