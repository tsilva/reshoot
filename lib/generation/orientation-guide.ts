import "server-only";
import sharp from "sharp";
import { shotOrientation, type GenerationShot, type OrientationGuide } from "./request";

type Point = [number, number, number];
type Triangle = [Point, Point, Point];

// Generic direction cue, never geometry inferred from a user's product.
// Keep this version deterministic; a future product-specific guide replaces
// this factory without changing the ordered original-photo inputs.
function cupTriangles(): Triangle[] {
  const triangles: Triangle[] = [];
  function surface(rows: number, columns: number, point: (row: number, column: number) => Point) {
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const a = point(row, column), b = point(row + 1, column);
      const c = point(row + 1, column + 1), d = point(row, column + 1);
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  const profile = [[0, 0], [.31, 0], [.38, .03], [.42, .15], [.46, .4],
    [.46, .9], [.455, .99], [.44, 1], [.415, .99], [.4, .95], [.405, .2], [.34, .08], [0, .08]];
  surface(48, profile.length - 1, (slice, layer) => {
    const angle = slice * 2 * Math.PI / 48, [radius, height] = profile[layer];
    return [radius * Math.sin(angle), height, radius * Math.cos(angle)];
  });
  surface(64, 8, (segment, ring) => {
    const angle = segment * 2 * Math.PI / 64, tube = ring * 2 * Math.PI / 8;
    return [.63 + (.33 + .065 * Math.cos(tube)) * Math.cos(angle),
      .52 + (.36 + .065 * Math.cos(tube)) * Math.sin(angle), .065 * Math.sin(tube)];
  });
  return triangles;
}

const triangles = cupTriangles();
const SIZE = 512;

// Orthographic software capture: one centered vertical pivot, no textures,
// no cast shadows, no browser/WebGL or external reconstruction dependency.
function renderCup(azimuth: number, elevation: number) {
  const yaw = azimuth * Math.PI / 180, tilt = elevation * Math.PI / 180;
  function transform([x, y, z]: Point): Point {
    const rotatedX = x * Math.cos(yaw) - z * Math.sin(yaw);
    const rotatedZ = x * Math.sin(yaw) + z * Math.cos(yaw);
    return [rotatedX, (y - .5) * Math.cos(tilt) - rotatedZ * Math.sin(tilt),
      (y - .5) * Math.sin(tilt) + rotatedZ * Math.cos(tilt)];
  }
  const faces = triangles.flatMap((triangle) => {
    const [a, b, c] = triangle.map(transform);
    const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal);
    if (length < 1e-10 || normal[2] <= 0) return [];
    const light = Math.max(0, (-3 * normal[0] + 7 * normal[1] + 4 * normal[2]) / (Math.sqrt(74) * length));
    const gray = Math.round(140 + 65 * light);
    const points = [a, b, c].map(([x, y]) => `${(SIZE / 2 + x * SIZE / 2.7).toFixed(2)},${(SIZE / 2 - y * SIZE / 2.7).toFixed(2)}`).join(" ");
    return [{ depth: (a[2] + b[2] + c[2]) / 3, svg: `<polygon points="${points}" fill="rgb(${gray},${gray},${gray})" stroke="rgb(${gray},${gray},${gray})" stroke-width="0.35"/>` }];
  });
  faces.sort((a, b) => a.depth - b.depth);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="100%" height="100%" fill="white"/>${faces.map((f) => f.svg).join("")}</svg>`;
}

export async function createGenericOrientationGuide(shot: GenerationShot): Promise<OrientationGuide | undefined> {
  const orientation = shotOrientation(shot);
  // Legacy label-only shots have no reliable yaw: do not invent a front cue.
  if (!orientation) return undefined;
  const png = await sharp(Buffer.from(renderCup(orientation.azimuth, orientation.elevation))).png().toBuffer();
  return { kind: "generic-cup-v1", ...orientation, image: `data:image/png;base64,${png.toString("base64")}` };
}
