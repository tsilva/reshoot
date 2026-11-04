import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { createOrientationGuide } from "../lib/generation/orientation-guide";

describe("orientation guides", () => {
  it("places a mug handle right, in front, left, then behind at fixed body scale", async () => {
    const rasters: Buffer[] = [];
    for (const azimuth of [0, 90, 180, 270]) {
      const guide = await createOrientationGuide({ label: "Mug", azimuth }, "upright-mug-v1");
      rasters.push(await sharp(Buffer.from(guide!.image.split(",")[1], "base64")).removeAlpha().raw().toBuffer());
    }
    const outside = (pixels: Buffer, start: number, end: number) => {
      let count = 0;
      for (let y = 180; y < 320; y++) for (let x = start; x < end; x++) if (pixels[(y * 512 + x) * 3] < 245) count++;
      return count;
    };
    expect(outside(rasters[0], 360, 470)).toBeGreaterThan(1000);
    expect(outside(rasters[0], 42, 150)).toBe(0);
    expect(outside(rasters[2], 42, 150)).toBeGreaterThan(1000);
    expect(outside(rasters[2], 360, 470)).toBe(0);
    for (const pixels of [rasters[1], rasters[3]]) {
      expect(outside(pixels, 42, 150) + outside(pixels, 360, 470)).toBe(0);
    }
    expect(rasters[1]).not.toEqual(rasters[3]);
    // Same base and rim rows at all four angles, independent of the handle.
    const column = (pixels: Buffer) => Array.from({ length: 512 }, (_, y) => pixels[(y * 512 + 256) * 3] < 245);
    expect(column(rasters[0])).toEqual(column(rasters[2]));
    expect(column(rasters[0])).toEqual(column(rasters[3]));
  });
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

  it.each([
    [45, "orange", "right"], [90, "orange", "center"], [135, "orange", "left"],
    [225, "blue", "right"], [270, "blue", "center"], [315, "blue", "left"],
  ])("places the intended rail at %s degrees", async (azimuth, color, placement) => {
    const guide = await createOrientationGuide({ label: "Turntable", azimuth }, "upright-phone-v2");
    const pixels = await sharp(Buffer.from(guide!.image.split(",")[1], "base64")).removeAlpha().raw().toBuffer();
    const row = Array.from({ length: 512 }, (_, x) => {
      const index = (256 * 512 + x) * 3;
      return [...pixels.subarray(index, index + 3)];
    });
    const rail = row.flatMap(([r, , b], x) => (color === "orange" ? r - b : b - r) > 100 ? [x] : []);
    expect(rail.length).toBeGreaterThan(5);
    const center = rail.reduce((sum, x) => sum + x, 0) / rail.length;
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
