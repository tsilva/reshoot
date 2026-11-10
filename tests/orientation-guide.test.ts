import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { createOrientationGuide } from "../lib/generation/orientation-guide";

describe("generic orientation frame", () => {
  it("renders eight distinct opaque frames without depending on an object label", async () => {
    const images = new Set<string>();
    for (const azimuth of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const guide = await createOrientationGuide({ label: "Object", azimuth, elevation: 0 });
      expect(guide).toMatchObject({ kind: "direction-frame-v1", azimuth, elevation: 0 });
      const png = Buffer.from(guide!.image.split(",")[1], "base64");
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info).toMatchObject({ width: 512, height: 512, channels: 4 });
      expect((await sharp(png).stats()).isOpaque).toBe(true);
      expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]);
      expect(await createOrientationGuide({ label: "Different object", azimuth, elevation: 0 })).toEqual(guide);
      images.add(guide!.image);
    }
    expect(images.size).toBe(8);
  });

  it.each([
    [45, "orange", "right"], [90, "orange", "center"], [135, "orange", "left"],
    [225, "blue", "right"], [270, "blue", "center"], [315, "blue", "left"],
  ])("places the intended physical side at %s degrees", async (azimuth, color, placement) => {
    const guide = await createOrientationGuide({ label: "Object", azimuth });
    const pixels = await sharp(Buffer.from(guide!.image.split(",")[1], "base64")).removeAlpha().raw().toBuffer();
    const side = Array.from({ length: 512 }, (_, x) => x).filter((x) => {
      const i = (256 * 512 + x) * 3;
      return (color === "orange" ? pixels[i] - pixels[i+2] : pixels[i+2] - pixels[i]) > 100;
    });
    expect(side.length).toBeGreaterThan(5);
    const center = side.reduce((sum, x) => sum + x, 0) / side.length;
    if (placement === "center") expect(center).toBeCloseTo(255.5, 0);
    if (placement === "left") expect(center).toBeLessThan(245);
    if (placement === "right") expect(center).toBeGreaterThan(267);
  });

  it("honors exact custom angles and normalizes equivalent turns", async () => {
    const guide = await createOrientationGuide({ label: "Custom", azimuth: 22, elevation: -12 });
    expect(guide).toMatchObject({ azimuth: 22, elevation: -12 });
    expect(guide!.image).not.toBe((await createOrientationGuide({ label: "Custom", azimuth: 22, elevation: 0 }))!.image);
    expect(guide!.image).not.toBe((await createOrientationGuide({ label: "Custom", azimuth: 0, elevation: -12 }))!.image);
    expect(await createOrientationGuide({ label: "Turn", azimuth: 405 }))
      .toEqual(await createOrientationGuide({ label: "Turn", azimuth: 45, elevation: 0 }));
    expect(await createOrientationGuide({ label: "Turn", azimuth: -45 }))
      .toEqual(await createOrientationGuide({ label: "Turn", azimuth: 315 }));
  });

  it("resolves known legacy presets without inventing directions for label-only shots", async () => {
    expect(await createOrientationGuide({ label: "Retake", presetKey: "back" })).toMatchObject({ azimuth: 180, elevation: 0 });
    expect(await createOrientationGuide({ label: "Lifestyle" })).toBeUndefined();
    expect(await createOrientationGuide({ label: "Unknown", presetKey: "__proto__" })).toBeUndefined();
    await expect(createOrientationGuide({ label: "Invalid", azimuth: NaN })).rejects.toThrow(RangeError);
    await expect(createOrientationGuide({ label: "Invalid", azimuth: 0, elevation: 91 })).rejects.toThrow(RangeError);
  });
});
