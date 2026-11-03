import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { renderPhoneTurntable, turntableAngles } from "../lib/generation/phone-turntable";

describe("shared phone turntable geometry", () => {
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
