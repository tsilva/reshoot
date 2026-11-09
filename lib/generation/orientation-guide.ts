import "server-only";
import sharp from "sharp";
import { ORIENTATION_GUIDE_KIND, shotOrientation, type GenerationShot, type OrientationGuide } from "./request";

type Point = [number, number, number];
type Surface = { vertices: Point[]; gray?: number; color?: string };

// A coordinate frame communicates physical directions without assuming an
// object category, shape, component layout, material or source camera angle.
function directionFrame(): Surface[] {
  const a: Point = [-.32, 0, .20], b: Point = [.32, 0, .20];
  const c: Point = [.32, 1, .20], d: Point = [-.32, 1, .20];
  const e: Point = [-.32, 0, -.20], f: Point = [.32, 0, -.20];
  const g: Point = [.32, 1, -.20], h: Point = [-.32, 1, -.20];
  return [
    { vertices: [a, b, c, d], color: "#363636" },
    { vertices: [f, e, h, g], color: "#c9c9c9" },
    { vertices: [b, f, g, c], color: "#ee6500" },
    { vertices: [e, a, d, h], color: "#167acf" },
    { vertices: [d, c, g, h], color: "#949494" },
    { vertices: [e, f, b, a], color: "#949494" },
  ];
}

const frameSurfaces = directionFrame();
const SIZE = 512;

// Orthographic software capture: one centered vertical pivot, no textures,
// no cast shadows, no browser/WebGL or external reconstruction dependency.
function renderGuide(azimuth: number, elevation: number) {
  const scale = SIZE * .8;
  const yaw = azimuth * Math.PI / 180, tilt = elevation * Math.PI / 180;
  function transform([x, y, z]: Point): Point {
    const rotatedX = x * Math.cos(yaw) - z * Math.sin(yaw);
    const rotatedZ = x * Math.sin(yaw) + z * Math.cos(yaw);
    return [rotatedX, (y - .5) * Math.cos(tilt) - rotatedZ * Math.sin(tilt),
      (y - .5) * Math.sin(tilt) + rotatedZ * Math.cos(tilt)];
  }
  const faces = frameSurfaces.flatMap((surface) => {
    const vertices = surface.vertices.map(transform);
    const [a, b, c] = vertices;
    const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal);
    if (length < 1e-10 || normal[2] <= 0) return [];
    const light = Math.max(0, (-3 * normal[0] + 7 * normal[1] + 4 * normal[2]) / (Math.sqrt(74) * length));
    const gray = (surface.gray ?? 140) + Math.round(65 * light);
    const fill = surface.color ?? `rgb(${gray},${gray},${gray})`;
    const points = vertices.map(([x, y]) => `${(SIZE / 2 + x * scale).toFixed(2)},${(SIZE / 2 - y * scale).toFixed(2)}`).join(" ");
    const depth = vertices.reduce((sum, vertex) => sum + vertex[2], 0) / vertices.length;
    return [{ depth, svg: `<polygon points="${points}" fill="${fill}" stroke="${fill}" stroke-width="0.35"/>` }];
  });
  faces.sort((a, b) => a.depth - b.depth);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="100%" height="100%" fill="white"/>${faces.map((f) => f.svg).join("")}</svg>`;
}

export async function createOrientationGuide(shot: GenerationShot): Promise<OrientationGuide | undefined> {
  const orientation = shotOrientation(shot);
  if (!orientation) return undefined;
  const png = await sharp(Buffer.from(renderGuide(orientation.azimuth, orientation.elevation))).png().toBuffer();
  return { kind: ORIENTATION_GUIDE_KIND, ...orientation, image: `data:image/png;base64,${png.toString("base64")}` };
}
