import "server-only";

import sharp from "sharp";

export const turntableAngles = [0, 45, 90, 135, 180, 225, 270, 315];

const SIZE = 1024;
const HEIGHT = 820;
const WIDTH = 390;
const DEPTH = 54;
const RADIUS = 34;
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
      if (data[(y * info.width + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right <= left || bottom <= top) throw new Error("The phone texture has no visible silhouette.");
  const texture = await sharp(buffer)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(width, HEIGHT, { fit: "fill" }).toColourspace("srgb").ensureAlpha().raw().toBuffer();

  // The shared shape supplies its own rounded corners. Extend the edge colors
  // through the source's transparent corners so every view has the same outline.
  for (let y = 0; y < HEIGHT; y++) {
    const row = y * width * 4;
    let first = 0, last = width - 1;
    while (first < width && texture[row + first * 4 + 3] < 128) first++;
    while (last >= first && texture[row + last * 4 + 3] < 128) last--;
    if (first === width) {
      if (y > 0) texture.copyWithin(row, row - width * 4, row);
      continue;
    }
    for (let x = 0; x < width; x++) {
      if (x >= first && x <= last) continue;
      const source = row + (x < first ? first : last) * 4;
      texture.copyWithin(row + x * 4, source, source + 4);
    }
  }
  return { data: texture, width };
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

  for (let row = 0; row < HEIGHT * SUPERSAMPLE; row++) {
    const y = (row + .5) / SUPERSAMPLE - HEIGHT / 2;
    const corner = Math.max(0, Math.abs(y) - (HEIGHT / 2 - RADIUS));
    const half = WIDTH / 2 - RADIUS + Math.sqrt(RADIUS ** 2 - corner ** 2);
    const destY = (canvasSize - HEIGHT * SUPERSAMPLE) / 2 + row;
    const textureY = Math.floor(row / SUPERSAMPLE);
    for (const { face, data, width } of faces) {
      const rail = face % 180 !== 0;
      const edge = face === 90 ? half : -half;
      const nearZ = face === 0 || face === 90 ? DEPTH / 2 : -DEPTH / 2;
      const start = rail ? project(edge, nearZ) : project(face === 0 ? -half : half, nearZ);
      const end = rail ? project(edge, -nearZ) : project(face === 0 ? half : -half, nearZ);
      const firstX = Math.ceil((start + SIZE / 2) * SUPERSAMPLE - .5);
      const lastX = Math.ceil((end + SIZE / 2) * SUPERSAMPLE - .5);
      for (let x = firstX; x < lastX; x++) {
        const fraction = ((x + .5) / SUPERSAMPLE - SIZE / 2 - start) / (end - start);
        const u = rail ? fraction : .5 + (fraction - .5) * 2 * half / WIDTH;
        const source = (textureY * width + Math.min(width - 1, Math.floor(u * width))) * 4;
        const dest = (destY * canvasSize + x) * 4;
        canvas[dest] = data[source];
        canvas[dest + 1] = data[source + 1];
        canvas[dest + 2] = data[source + 2];
        canvas[dest + 3] = 255;
      }
    }
  }
  return sharp(canvas, { raw: { width: canvasSize, height: canvasSize, channels: 4 } })
    .resize(SIZE, SIZE).png().toBuffer();
}
