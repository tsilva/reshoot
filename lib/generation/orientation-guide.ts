import "server-only";
import sharp from "sharp";
import { shotOrientation, type GenerationShot, type OrientationGuide, type OrientationGuideKind } from "./request";

type Point = [number, number, number];
type Triangle = [Point, Point, Point, gray?: number];
type Surface = { vertices: Point[]; gray?: number; color?: string };

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

function phoneSurfaces(colorCoded: boolean): Surface[] {
  const radius = .055, halfWidth = .25, halfDepth = .025;
  const rim = [[halfWidth - radius, 1 - radius], [-halfWidth + radius, 1 - radius],
    [-halfWidth + radius, radius], [halfWidth - radius, radius]]
    .flatMap(([x, y], corner) => Array.from({ length: 9 }, (_, step) => {
      const angle = (corner + step / 8) * Math.PI / 2;
      return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
    }));
  const front = rim.map(([x, y]): Point => [x, y, halfDepth]);
  const back = rim.map(([x, y]): Point => [x, y, -halfDepth]);
  if (colorCoded) {
    const rails = front.map((point, i) => {
      const next = (i + 1) % front.length;
      const longSide = Math.abs(front[next][1] - point[1]) > .5;
      return {
        vertices: [point, back[i], back[next], front[next]],
        color: longSide ? (point[0] > 0 ? "#ee6500" : "#167acf") : "#949494",
      };
    });
    return [
      { vertices: front, color: "#363636" },
      { vertices: [...back].reverse(), color: "#c9c9c9" },
      ...rails,
    ];
  }
  return front.flatMap((point, i): Surface[] => {
    const next = (i + 1) % front.length;
    return [
      { vertices: [[0, .5, halfDepth], point, front[next]], gray: 75 },
      { vertices: [[0, .5, -halfDepth], back[next], back[i]], gray: 183 },
      { vertices: [point, back[i], back[next]], gray: 127 },
      { vertices: [point, back[next], front[next]], gray: 127 },
    ];
  });
}

const surfacesByKind: Record<OrientationGuideKind, Surface[]> = {
  "generic-cup-v1": cupTriangles().map(([a, b, c]) => ({ vertices: [a, b, c] })),
  "upright-phone-v1": phoneSurfaces(false),
  "upright-phone-v2": phoneSurfaces(true),
};
const SIZE = 512;

// Orthographic software capture: one centered vertical pivot, no textures,
// no cast shadows, no browser/WebGL or external reconstruction dependency.
function renderGuide(kind: OrientationGuideKind, azimuth: number, elevation: number) {
  const isPhone = kind !== "generic-cup-v1";
  const scale = isPhone ? SIZE * .8 : SIZE / 2.7;
  const yaw = azimuth * Math.PI / 180, tilt = elevation * Math.PI / 180;
  function transform([x, y, z]: Point): Point {
    const rotatedX = x * Math.cos(yaw) - z * Math.sin(yaw);
    const rotatedZ = x * Math.sin(yaw) + z * Math.cos(yaw);
    return [rotatedX, (y - .5) * Math.cos(tilt) - rotatedZ * Math.sin(tilt),
      (y - .5) * Math.sin(tilt) + rotatedZ * Math.cos(tilt)];
  }
  const faces = surfacesByKind[kind].flatMap((surface) => {
    const vertices = surface.vertices.map(transform);
    const [a, b, c] = vertices;
    const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal);
    if (length < 1e-10 || normal[2] <= 0) return [];
    const light = Math.max(0, (-3 * normal[0] + 7 * normal[1] + 4 * normal[2]) / (Math.sqrt(74) * length));
    const gray = (surface.gray ?? 140) + Math.round((isPhone ? 28 : 65) * light);
    const fill = surface.color ?? `rgb(${gray},${gray},${gray})`;
    const points = vertices.map(([x, y]) => `${(SIZE / 2 + x * scale).toFixed(2)},${(SIZE / 2 - y * scale).toFixed(2)}`).join(" ");
    const depth = vertices.reduce((sum, vertex) => sum + vertex[2], 0) / vertices.length;
    return [{ depth, svg: `<polygon points="${points}" fill="${fill}" stroke="${fill}" stroke-width="0.35"/>` }];
  });
  faces.sort((a, b) => a.depth - b.depth);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="100%" height="100%" fill="white"/>${faces.map((f) => f.svg).join("")}</svg>`;
}

export async function createOrientationGuide(shot: GenerationShot, kind: OrientationGuideKind = "generic-cup-v1"): Promise<OrientationGuide | undefined> {
  const orientation = shotOrientation(shot);
  // Legacy label-only shots have no reliable yaw: do not invent a front cue.
  if (!orientation) return undefined;
  const png = await sharp(Buffer.from(renderGuide(kind, orientation.azimuth, orientation.elevation))).png().toBuffer();
  return { kind, ...orientation, image: `data:image/png;base64,${png.toString("base64")}` };
}
