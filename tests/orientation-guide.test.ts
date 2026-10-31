import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { createGenericOrientationGuide } from "../lib/generation/orientation-guide";

describe("generic orientation cue", () => {
  it("renders distinct neutral, opaque raster views across the full turn", async () => {
    const images = new Set<string>();
    for (const azimuth of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const guide = await createGenericOrientationGuide({ label: "Turntable", azimuth, elevation: 0 });
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

  it("honors exact custom angles and normalizes equivalent turns", async () => {
    const guide = await createGenericOrientationGuide({ label: "Custom", azimuth: 22, elevation: -12 });
    expect(guide).toMatchObject({ azimuth: 22, elevation: -12 });
    expect(guide!.image).not.toBe((await createGenericOrientationGuide({ label: "Custom", azimuth: 22, elevation: 0 }))!.image);
    expect(guide!.image).not.toBe((await createGenericOrientationGuide({ label: "Custom", azimuth: 0, elevation: -12 }))!.image);
    expect(await createGenericOrientationGuide({ label: "Turn", azimuth: 405 }))
      .toEqual(await createGenericOrientationGuide({ label: "Turn", azimuth: 45, elevation: 0 }));
    expect(await createGenericOrientationGuide({ label: "Turn", azimuth: -45 }))
      .toEqual(await createGenericOrientationGuide({ label: "Turn", azimuth: 315 }));
  });

  it("resolves known legacy presets without inventing directions for label-only shots", async () => {
    expect(await createGenericOrientationGuide({ label: "Retake", presetKey: "back" })).toMatchObject({ azimuth: 180, elevation: 0 });
    expect(await createGenericOrientationGuide({ label: "Lifestyle" })).toBeUndefined();
    expect(await createGenericOrientationGuide({ label: "Unknown", presetKey: "__proto__" })).toBeUndefined();
    await expect(createGenericOrientationGuide({ label: "Invalid", azimuth: NaN })).rejects.toThrow(RangeError);
    await expect(createGenericOrientationGuide({ label: "Invalid", azimuth: 0, elevation: 91 })).rejects.toThrow(RangeError);
  });
});
