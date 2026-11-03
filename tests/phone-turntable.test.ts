import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { renderPhoneTurntable, turntableAngles } from "../lib/generation/phone-turntable";

describe("shared phone turntable geometry", () => {
  it("preserves the source's transparent corners instead of extending the edge colors", async () => {
    const front = await sharp(Buffer.from(
      '<svg width="120" height="256"><rect width="120" height="256" rx="25" fill="#4d5366"/></svg>',
    )).png().toBuffer();
    const image = await renderPhoneTurntable(0, async () => front);
    const pixels = await sharp(image).raw().toBuffer();
    const alpha = (x: number, y: number) => pixels[(y * 1024 + x) * 4 + 3];
    expect(alpha(355, 108)).toBe(0);
    expect(alpha(512, 108)).toBe(255);
    expect(alpha(355, 145)).toBe(255);
  });

  it.each([45, 135, 225, 315])("keeps the side rail straight through button protrusions at %s°", async (angle) => {
    const panel = await sharp(Buffer.from(
      '<svg width="120" height="256"><rect x="6" width="108" height="256" rx="10" fill="#444"/>'
      + '<rect y="100" width="120" height="44" fill="#444"/></svg>',
    )).png().toBuffer();
    const rail = await sharp(Buffer.from(
      '<svg width="18" height="256"><rect width="18" height="256" fill="#e22"/>'
      + '<rect x="7" y="70" width="4" height="100" fill="#0f0"/></svg>',
    )).png().toBuffer();
    const output = await renderPhoneTurntable(angle, async (face) => face % 180 === 0 ? panel : rail);
    const pixels = await sharp(output).raw().toBuffer();
    const railAndButton = (y: number) => {
      const railXs: number[] = [], buttonXs: number[] = [];
      for (let x = 0; x < 1024; x++) {
        const i = (y * 1024 + x) * 4;
        if (pixels[i + 3] < 240) continue;
        if (pixels[i] > 180 && pixels[i + 1] < 60) railXs.push(x);
        if (pixels[i] < 60 && pixels[i + 1] > 180) buttonXs.push(x);
      }
      const outerEdge = angle === 45 || angle === 225 ? railXs.at(-1) : railXs[0];
      return { outerEdge, buttonXs };
    };
    const before = railAndButton(390);
    expect(before.outerEdge).toBeDefined();
    expect(before.buttonXs.length).toBeGreaterThan(4);
    expect(railAndButton(480)).toEqual(before);
    expect(railAndButton(590)).toEqual(before);
  });

  it("renders all eight views with a fixed height and puts each rear rail on the correct side", async () => {
    const colors = new Map([[0, "#444444"], [90, "#ff0000"], [180, "#dddddd"], [270, "#0000ff"]]);
    const source = async (face: number) => sharp({
      create: { width: face % 180 === 0 ? 120 : 18, height: 256, channels: 4, background: colors.get(face)! },
    }).png().toBuffer();
    for (const angle of turntableAngles) {
      const load = vi.fn(source);
      const { data, info } = await sharp(await renderPhoneTurntable(angle, load)).raw()
        .toBuffer({ resolveWithObject: true });
      expect(info).toMatchObject({ width: 1024, height: 1024, channels: 4 });
      const opaqueRows = Array.from({ length: 1024 }, (_, y) => data[(y * 1024 + 512) * 4 + 3])
        .filter((alpha) => alpha >= 128);
      expect(opaqueRows).toHaveLength(820);
      if (angle === 135 || angle === 225) {
        const pixel = (x: number) => [...data.subarray((512 * 1024 + x) * 4, (512 * 1024 + x) * 4 + 4)];
        expect(pixel(512)).toEqual([221, 221, 221, 255]);
        expect(pixel(angle === 135 ? 375 : 649)).toEqual(
          angle === 135 ? [255, 0, 0, 255] : [0, 0, 255, 255],
        );
        expect(load.mock.calls.map(([face]) => face)).toEqual([angle === 135 ? 90 : 270, 180]);
      }
    }
  });
});
