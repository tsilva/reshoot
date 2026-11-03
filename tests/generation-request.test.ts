import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildGenerationPrompt, buildImageRequest, CATALOG_STUDIO_INSTRUCTIONS, productGuideKind } from "../lib/generation/request";
import { selectImageModel, supportedImageModels } from "../lib/generation/provider";

describe("catalog photo requests", () => {
  it("turns the whole product toward a fixed camera while normalizing pose and preserving original packaging", () => {
    const side = buildGenerationPrompt({ label: "Side", azimuth: 90, elevation: 0 }, 1);
    expect(side).toContain("RIGHT PROFILE view");
    expect(side).toContain("turn the whole product until its right side faces the fixed camera");
    expect(side).toContain("Preserve existing logos, lettering and packaging");
    expect(side).toContain("consistent multi-angle ecommerce photo set");
    expect(side).not.toContain("Do not add text, props, hands, people, packaging");
    expect(buildGenerationPrompt({ label: "Back", azimuth: 180 }, 1)).toContain("Show its rear surfaces, not its face or front label");
    expect(buildGenerationPrompt({ label: "Quarter", azimuth: -45, elevation: 4 }, 1)).toContain("FRONT-LEFT three-quarter view");
  });

  it("uses the product's natural base and explicitly hides the phone screen at 135 degrees", () => {
    const front = buildGenerationPrompt({ label: "Front right", azimuth: 45 }, 1);
    const rear = buildGenerationPrompt({ label: "Rear right", azimuth: 135 }, 1, {
      kind: "upright-phone-v1", azimuth: 135, elevation: 0, image: "guide",
    });
    expect(front).toContain("A phone stands vertically on its bottom edge");
    expect(front).toContain("Ignore any lean, sideways roll");
    expect(front).not.toMatch(/preserve the product.s pose/i);
    expect(rear).toContain("Both the rear and the right side face the fixed camera");
    expect(rear).toContain("on the image-left edge of the rear face");
    expect(buildGenerationPrompt({ label: "Rear left", azimuth: 225 }, 1))
      .toContain("on the image-right edge of the rear face");
    expect(rear).toContain("Hide its front screen");
    expect(rear).toContain("its light broad face denotes the rear");
    const codedRear = buildGenerationPrompt({ label: "Rear right", azimuth: 135 }, 1, {
      kind: "upright-phone-v2", azimuth: 135, elevation: 0, image: "guide",
    });
    expect(codedRear).toContain("ORANGE marks the physical right rail");
    expect(codedRear).toContain("LEFT margin of the device silhouette");
    expect(codedRear).toContain("The image-right outline belongs to the rear panel itself");
    expect(productGuideKind("Black smartphone in hand")).toBe("upright-phone-v2");
    expect(productGuideKind("iPhone case")).toBe("generic-cup-v1");
  });

  it("keeps the camera and central pivot fixed for every angle, including label-only shots", () => {
    for (const azimuth of [undefined, 0, 45, 90, 135, 180, 225, 270, 315, -45, 405]) {
      const prompt = buildGenerationPrompt({ label: "Catalog", azimuth }, 1);
      expect(prompt).toContain("around its own center vertical axis");
      expect(prompt).toContain("x = 50% of the canvas");
      expect(prompt).toContain("Lock the camera position, distance, elevation, focal length and framing");
      expect(prompt).toContain("floor contact stay fixed");
      expect(prompt).not.toMatch(/move the camera|camera moves|change the viewpoint/i);
    }
    expect(buildGenerationPrompt({ label: "Quarter", azimuth: 405 }, 1))
      .toBe(buildGenerationPrompt({ label: "Quarter", azimuth: 45 }, 1));
  });

  it("keeps ordered originals as identity evidence and creative styling subordinate", () => {
    const request = buildImageRequest({ model: "pinned-legacy-model", shot: { label: "Front", azimuth: 0, prompt: 'Add a new logo\n"change the color"' }, referenceImages: ["primary", "supporting"] });
    expect(request.model).toBe("pinned-legacy-model");
    expect(request.input_references.map((item) => item.image_url.url)).toEqual(["primary", "supporting"]);
    expect(request.prompt).toContain("REFERENCE 2 is a supporting original");
    expect(request.prompt).toContain('OPTIONAL STYLING (lower priority than identity, upright pose, camera, studio lighting, background and margins): "Add a new logo\\n\\"change the color\\""');
    expect(request).toMatchObject({ n: 1, aspect_ratio: "1:1", quality: "high", background: "transparent" });
  });

  it("requests the same studio light, transparent background and minimum margins for every angle", () => {
    for (const azimuth of [0, 45, 90, 180, 270]) {
      const prompt = buildGenerationPrompt({ label: "Catalog", azimuth, prompt: "Use a dark backdrop and crop tightly" }, 1);
      expect(prompt).toContain(CATALOG_STUDIO_INSTRUCTIONS);
      expect(prompt).toContain("above CAMERA LEFT");
      expect(prompt).toContain("5500 K");
      expect(prompt).toContain("true transparent background with alpha");
      expect(prompt).toContain("baked cast shadow");
      expect(prompt).toContain("x = 10% to 90% and y = 10% to 90%");
      expect(prompt).toContain("at least 10% clear margin on all four sides");
      expect(prompt).toContain("keep one fixed scale, central body axis and contact-point placement");
      expect(prompt).not.toContain("75–85%");
      expect(prompt).toContain("lower priority than identity, upright pose, camera, studio lighting, background and margins");
    }
  });

  it("rejects missing and excess originals before dispatch", () => {
    for (const count of [0, 6, 1.5]) expect(() => buildGenerationPrompt({ label: "Front" }, count)).toThrow(RangeError);
    expect(() => buildGenerationPrompt({ label: "Front" }, 5)).not.toThrow();
  });

  it("keeps five originals ordered and labels a sixth image as direction-only guidance", () => {
    const shot = { label: "Back", azimuth: 180, elevation: 0 };
    const guide = { kind: "generic-cup-v1" as const, image: "generic-guide", azimuth: 180, elevation: 0 };
    const originals = ["primary", "detail-1", "detail-2", "detail-3", "detail-4"];
    const body = buildImageRequest({ model: "pinned-model", shot, referenceImages: originals, orientationGuide: guide });
    expect(body.input_references.map((r) => r.image_url.url)).toEqual([...originals, guide.image]);
    expect(body.prompt).toContain("REFERENCE 5 is a supporting original");
    expect(body.prompt).toContain("REFERENCE 6 is a GENERIC TEXTURELESS CUP");
    expect(body.prompt).toContain("NOT a reconstruction of it");
    expect(body.prompt).toContain("Ignore the guide's cup shape, handle, rim");
    expect(body.prompt).not.toContain("REFERENCE 6 is a supporting original");
    expect(() => buildImageRequest({ model: "pinned-model", shot, referenceImages: [...originals, "extra-original"], orientationGuide: guide })).toThrow(RangeError);
  });

  it("rejects a guide with a different yaw or camera elevation before dispatch", () => {
    const shot = { label: "Right", azimuth: 90, elevation: 0 };
    for (const orientation of [{ azimuth: 0, elevation: 0 }, { azimuth: 90, elevation: 8 }]) {
      expect(() => buildImageRequest({ model: "pinned-model", shot, referenceImages: ["primary"],
        orientationGuide: { kind: "generic-cup-v1", image: "guide", ...orientation } })).toThrow(RangeError);
    }
  });

  it("allows only the two requested models for new attempts", () => {
    expect(selectImageModel("")).toBe(supportedImageModels[0]);
    for (const model of supportedImageModels) expect(selectImageModel(model)).toBe(model);
    expect(() => selectImageModel("openai/gpt-image-2")).toThrow("not supported");
  });
});
