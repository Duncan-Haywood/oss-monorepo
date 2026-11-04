/**
 * Garment mesh for the 3D preview. Pure maths, no DOM and no WebGL, so it is
 * testable in Node; `viewer3d.mjs` draws it.
 *
 * Method (an approximation, said plainly): the flat garment drawing is turned
 * into a "pillow". A grid is laid over the drawing; the cells inside the outline
 * become a front and a back surface that meet at the outline, and each vertex is
 * pushed out of the plane by a rounded profile of its distance from the edge,
 * z = sqrt(d (2R - d)). The front drawing is mapped on the front surface and the
 * back drawing on the back, so artwork sits where the designer put it and turns
 * with the garment. It has no drape, seams, gathers or true sleeve tubes, and it
 * is not a fit check or a pattern. Real cloth simulation and body models are the
 * next step in ROADMAP.md.
 */
import { VIEWBOX } from "./catalogue.mjs";

/** Grid of inside/outside cells over the drawing: `inside(x, y)` in drawing units. */
export function maskGrid(inside, { cell = 6, box = VIEWBOX } = {}) {
  const cols = Math.ceil(box.width / cell);
  const rows = Math.ceil(box.height / cell);
  // vertices are at cell corners; a vertex is "in" if its own point is inside
  const vcols = cols + 1, vrows = rows + 1;
  const v = new Uint8Array(vcols * vrows);
  for (let j = 0; j < vrows; j++) for (let i = 0; i < vcols; i++) {
    v[j * vcols + i] = inside(box.x + i * cell, box.y + j * cell) ? 1 : 0;
  }
  return { vcols, vrows, cell, box, v };
}

/** Distance, in cells (chamfer 3-4 approximation), from each inside vertex to the nearest outside one. */
export function edgeDistance(g) {
  const { vcols: W, vrows: H, v } = g;
  const INF = 1e9;
  const d = new Float32Array(W * H);
  for (let k = 0; k < d.length; k++) d[k] = v[k] ? INF : 0;
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : d[j * W + i]);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (!v[k]) continue;
    d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.4142, at(i + 1, j - 1) + 1.4142);
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i;
    if (!v[k]) continue;
    d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.4142, at(i - 1, j + 1) + 1.4142);
  }
  return d;
}

/**
 * Out-of-plane height at a vertex: a quarter ellipse rising from the edge over
 * `radius` drawing units to `thickness` (default: a circle, thickness = radius).
 */
export function height(distCells, cell, radius, thickness = radius) {
  const s = Math.min(1, (distCells * cell) / radius);
  return thickness * Math.sqrt(Math.max(0, 1 - (1 - s) * (1 - s)));
}

/** Two passes of a 3x3 mean over inside vertices, so the surface normals are not staircased. */
export function smooth(zs, W, H, v, passes = 2) {
  let a = zs;
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!v[k]) continue;
      let sum = 0, cnt = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        sum += a[jj * W + ii]; cnt++;
      }
      b[k] = sum / cnt;
    }
    a = b;
  }
  return a;
}

/**
 * Build the mesh. Returns flat typed arrays:
 *   positions (x, y, z) centred on the drawing's middle, y up, z toward the viewer
 *   uvs, normals, indices (Uint32), and the counts.
 * Front vertices come first, then back. The back's u is mirrored so the back
 * drawing reads correctly seen from behind.
 */
export function buildGarmentMesh(inside, { cell = 4, radius = 105, thickness = 58, box = VIEWBOX } = {}) {
  const g = maskGrid(inside, { cell, box });
  const { vcols: W, vrows: H, v } = g;
  const dist = edgeDistance(g);
  let zs = new Float32Array(W * H);
  for (let k = 0; k < zs.length; k++) zs[k] = v[k] ? height(dist[k], cell, radius, thickness) : 0;
  zs = smooth(zs, W, H, v);
  const n = W * H;
  const positions = new Float32Array(n * 6);
  const normals = new Float32Array(n * 6);
  const uvs = new Float32Array(n * 4);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const zAt = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : zs[j * W + i]);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const x = box.x + i * cell, y = box.y + j * cell;
    const u = (x - box.x) / box.width, vv = (y - box.y) / box.height;
    // normal from the height field: (-dz/dx, -dz/dy, 1) with y flipped to y-up
    const dzdx = (zAt(i + 1, j) - zAt(i - 1, j)) / (2 * cell);
    const dzdy = (zAt(i, j + 1) - zAt(i, j - 1)) / (2 * cell);
    for (const side of [0, 1]) {
      const s = side ? -1 : 1;
      const o = side * n + k;
      positions[o * 3] = x - cx;
      positions[o * 3 + 1] = -(y - cy);
      positions[o * 3 + 2] = s * zs[k];
      const nx = -dzdx * s, ny = dzdy * s, nz = s;  // y-up flips dzdy's sign
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[o * 3] = nx / len; normals[o * 3 + 1] = ny / len; normals[o * 3 + 2] = nz / len;
      uvs[o * 2] = side ? 1 - u : u;
      uvs[o * 2 + 1] = vv;
    }
  }
  const idx = [], back = [];
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    // keep a quad when at least three corners are inside (smooths the staircase edge)
    const inn = v[a] + v[b] + v[c] + v[d];
    if (inn < 3) continue;
    idx.push(a, c, b, b, c, d);                              // front, counter-clockwise
    back.push(n + a, n + b, n + c, n + b, n + d, n + c);     // back, reversed
  }
  const frontCount = idx.length;
  idx.push(...back);
  return { positions, normals, uvs, indices: new Uint32Array(idx), frontCount, vertexCount: n * 2, triangleCount: idx.length / 3, grid: g };
}

// ---- tiny 4x4 matrix helpers (column-major, as WebGL wants) ----
export const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
export function rotationY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
export function rotationX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
export const translation = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

/** Orbit camera state to a model-view-projection matrix. yaw 0 = looking at the front. */
export const rotationMatrix = (yaw, pitch) => multiply(rotationX(Math.max(-1.2, Math.min(1.2, pitch))), rotationY(yaw));

export function orbitMatrix({ yaw = 0, pitch = 0, distance = 900, aspect = 1, fov = 0.6 } = {}) {
  const p = Math.max(-1.2, Math.min(1.2, pitch));
  const model = rotationMatrix(yaw, p);
  const view = translation(0, 0, -distance);
  return multiply(perspective(fov, aspect, 50, 4000), multiply(view, model));
}

/** Transform a point by a column-major matrix and divide by w. */
export function project(m, [x, y, z]) {
  const X = m[0] * x + m[4] * y + m[8] * z + m[12];
  const Y = m[1] * x + m[5] * y + m[9] * z + m[13];
  const W = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [X / W, Y / W, W];
}
