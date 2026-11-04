import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { mugOrientationFailure } from "../lib/generation/mug-alignment";

function mug(handle: "left" | "right" | "none") {
  return sharp(Buffer.from(`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    ${handle === "none" ? "" : `<ellipse cx="${handle === "right" ? 386 : 126}" cy="240" rx="70" ry="110" fill="none" stroke="#123abc" stroke-width="22"/>`}
    <rect x="146" y="76" width="220" height="360" rx="30" fill="#123abc"/>
  </svg>`));
}

describe("mug handle orientation", () => {
  it.each([0, 45, 315])("accepts a visible right handle at %s degrees", async (angle) => {
    expect(await mugOrientationFailure(mug("right"), angle)).toBeUndefined();
  });
  it.each([135, 180, 225])("accepts a visible left handle at %s degrees", async (angle) => {
    expect(await mugOrientationFailure(mug("left"), angle)).toBeUndefined();
  });
  it.each([90, 270])("rejects the copied source pose at the discriminating %s-degree view", async (angle) => {
    expect(await mugOrientationFailure(mug("right"), angle)).toContain("open handle loop");
    expect(await mugOrientationFailure(mug("none"), angle)).toBeUndefined();
  });
  it("rejects wrong-side and missing side-on loops", async () => {
    expect(await mugOrientationFailure(mug("right"), 180)).toContain("wrong side");
    expect(await mugOrientationFailure(mug("right"), 225)).toContain("wrong side");
    expect(await mugOrientationFailure(mug("left"), 0)).toContain("wrong side");
    expect(await mugOrientationFailure(mug("none"), 0)).toContain("missing");
    // A partially occluded quarter handle need not enclose a detectable hole.
    expect(await mugOrientationFailure(mug("none"), 225)).toBeUndefined();
  });
});
