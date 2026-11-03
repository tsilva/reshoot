import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { createOrientationGuide } from "../lib/generation/orientation-guide";

describe("orientation guides", () => {
  it("renders distinct neutral, opaque raster views across the full turn", async () => {
    const images = new Set<string>();
    for (const azimuth of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const guide = await createOrientationGuide({ label: "Turntable", azimuth, elevation: 0 });
      expect(guide).toMatchObject({ kind: "generic-cup-v1", azimuth, elevation: 0 });
      const png = Buffer.from(guide!.image.split(",")[1], "base64");
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info).toMatchObject({ width: 512, height: 512, channels: 4 });
      let foreground = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) throw Error("Guide contains color/texture cues");
        if (data[i + 3] !== 255) throw Error("Guide is not opaque");
        if (data[i] < 245) foreground++;
      }
      expect(foreground).toBeGreaterThan(10000);
      expect(foreground).toBeLessThan(512 * 512 / 2);
      expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]);
      images.add(guide!.image);
    }
    expect(images.size).toBe(8);
  });

  it("keeps the phone vertical at both right quarters and distinguishes its front and back", async () => {
    const shot = { label: "Quarter", elevation: 0 };
    const front = await createOrientationGuide({ ...shot, azimuth: 45 }, "upright-phone-v1");
    const rear = await createOrientationGuide({ ...shot, azimuth: 135 }, "upright-phone-v1");
    const read = (image: string) => sharp(Buffer.from(image.split(",")[1], "base64")).removeAlpha().raw().toBuffer();
    const frontPixels = await read(front!.image);
    const rearPixels = await read(rear!.image);
    const get = (pixels: Buffer, x: number, y: number) => pixels[(y * 512 + x) * 3];
    expect(frontPixels).not.toEqual(rearPixels);
    expect(get(frontPixels, 256, 256)).toBeLessThan(110);
    expect(get(rearPixels, 256, 256)).toBeGreaterThan(175);
    for (const pixels of [frontPixels, rearPixels]) {
      const bodyRow = (y: number) => Array.from({ length: 512 }, (_, x) => get(pixels, x, y) < 245);
      expect(bodyRow(128)).toEqual(bodyRow(384));
      expect(bodyRow(20).some(Boolean)).toBe(false);
    }
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
