import "server-only";

import sharp from "sharp";

export const turntableAngles = [0, 45, 90, 135, 180, 225, 270, 315];

const SIZE = 1024;
const HEIGHT = 820;
const WIDTH = 390;
const DEPTH = 54;
const SUPERSAMPLE = 2;

export function turntableFaces(angle: number): number[] {
  const faces: number[] = [];
  if (angle > 0 && angle < 180) faces.push(90);
  if (angle > 180 && angle < 360) faces.push(270);
  if (angle < 90 || angle > 270) faces.push(0);
  if (angle > 90 && angle < 270) faces.push(180);
  return faces;
}

async function phoneTexture(buffer: Buffer, width: number) {
  const { data, info } = await sharp(buffer).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, right = -1, top = info.height, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right <= left || bottom <= top) throw new Error("The phone texture has no visible silhouette.");
  const textureWidth = width * SUPERSAMPLE;
  const texture = await sharp(buffer)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(textureWidth, HEIGHT * SUPERSAMPLE, { fit: "fill" })
    .toColourspace("srgb").ensureAlpha().raw().toBuffer();
  return { data: texture, width: textureWidth };
}

function faceEdge(data: Buffer, width: number, row: number, right: boolean) {
  for (let offset = 0; offset < width; offset++) {
    const x = right ? width - 1 - offset : offset;
    if (data[(row * width + x) * 4 + 3] >= 128) return (x + (right ? 1 : 0)) / width;
  }
  return undefined;
}

function compositePixel(canvas: Buffer, dest: number, texture: Buffer, source: number) {
  const alpha = texture[source + 3];
  if (alpha === 0) return;
  const behind = canvas[dest + 3] * (1 - alpha / 255);
  const combined = alpha + behind;
  for (let channel = 0; channel < 3; channel++) {
    canvas[dest + channel] = Math.round(
      (texture[source + channel] * alpha + canvas[dest + channel] * behind) / combined,
    );
  }
  canvas[dest + 3] = Math.round(combined);
}

export async function renderPhoneTurntable(angle: number, loadFace: (face: number) => Promise<Buffer>) {
  if (!turntableAngles.includes(angle)) throw new RangeError("Unsupported phone turntable angle.");
  const faces = await Promise.all(turntableFaces(angle).map(async (face) => ({
    face, ...await phoneTexture(await loadFace(face), face % 180 === 0 ? WIDTH : DEPTH),
  })));
  const canvasSize = SIZE * SUPERSAMPLE;
  const canvas = Buffer.alloc(canvasSize ** 2 * 4);
  const yaw = angle * Math.PI / 180;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const project = (x: number, z: number) => x * cos - z * sin;

  const broadFace = faces.find(({ face }) => face % 180 === 0);
  const back = broadFace?.face === 180;
  const faceStart = project(back ? WIDTH / 2 : -WIDTH / 2, back ? -DEPTH / 2 : DEPTH / 2);
  const faceEnd = project(back ? -WIDTH / 2 : WIDTH / 2, back ? -DEPTH / 2 : DEPTH / 2);
  const railOnRight = cos * sin > 0;
  const railWidth = Math.abs(DEPTH * sin);

  // Project the original cutout alpha with its colors. On quarter views the
  // rail meets the visible face's actual rounded edge, with half a pixel of
  // overlap under the face's antialiasing to keep the seam closed.
  for (let row = 0; row < HEIGHT * SUPERSAMPLE; row++) {
    const destY = (canvasSize - HEIGHT * SUPERSAMPLE) / 2 + row;
    const edge = broadFace && faces.length > 1
      ? faceEdge(broadFace.data, broadFace.width, row, railOnRight)
      : undefined;
    const seam = edge === undefined ? undefined : faceStart + edge * (faceEnd - faceStart);
    for (const { face, data, width } of faces) {
      const rail = face % 180 !== 0;
      let start = faceStart, end = faceEnd;
      if (rail) {
        if (broadFace && seam === undefined) continue;
        if (seam === undefined) {
          start = -railWidth / 2;
          end = railWidth / 2;
        } else {
          start = seam - (railOnRight ? .5 : railWidth);
          end = seam + (railOnRight ? railWidth : .5);
        }
      }
      const firstX = Math.ceil((start + SIZE / 2) * SUPERSAMPLE - .5);
      const lastX = Math.ceil((end + SIZE / 2) * SUPERSAMPLE - .5);
      for (let x = firstX; x < lastX; x++) {
        const fraction = ((x + .5) / SUPERSAMPLE - SIZE / 2 - start) / (end - start);
        const source = (row * width + Math.min(width - 1, Math.floor(fraction * width))) * 4;
        compositePixel(canvas, (destY * canvasSize + x) * 4, data, source);
      }
    }
  }
  return sharp(canvas, { raw: { width: canvasSize, height: canvasSize, channels: 4 } })
    .resize(SIZE, SIZE).png().toBuffer();
}
