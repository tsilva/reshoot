import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildGenerationPrompt, buildImageRequest, CATALOG_STUDIO_INSTRUCTIONS } from "../lib/generation/request";
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
    expect(request.prompt).toContain('OPTIONAL STYLING (lower priority than identity, camera, studio lighting, background and margins): "Add a new logo\\n\\"change the color\\""');
    expect(request).toMatchObject({ n: 1, aspect_ratio: "1:1", quality: "high", background: "opaque" });
  });

  it("requests the same studio light, white background and minimum margins for every angle", () => {
    for (const azimuth of [0, 45, 90, 180, 270]) {
      const prompt = buildGenerationPrompt({ label: "Catalog", azimuth, prompt: "Use a dark backdrop and crop tightly" }, 1);
      expect(prompt).toContain(CATALOG_STUDIO_INSTRUCTIONS);
      expect(prompt).toContain("above CAMERA LEFT");
      expect(prompt).toContain("5500 K");
      expect(prompt).toContain("pure-white #FFFFFF");
      expect(prompt).toContain("x = 10% to 90% and y = 10% to 90%");
      expect(prompt).toContain("at least 10% clear margin on all four sides");
      expect(prompt).toContain("keep one fixed scale, central body axis and contact-point placement");
      expect(prompt).not.toContain("75–85%");
      expect(prompt).toContain("lower priority than identity, camera, studio lighting, background and margins");
    }
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
