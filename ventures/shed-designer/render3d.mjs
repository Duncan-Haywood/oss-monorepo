// @ts-check
// A small WebGL viewer for the framed shed: every board is its own extruded
// profile with real dimensions, lit with two lights and outlined so you can
// count studs. No library; drag to orbit, wheel or buttons to zoom.

/** @typedef {import('./model.mjs').Geom} Geom */
/** @typedef {{ geom: Geom, color: [number, number, number], layer: string, dots?: boolean }} Solid */

const COLORS = {
  pt: [0.71, 0.77, 0.58], framing: [0.9, 0.79, 0.57], header: [0.85, 0.66, 0.38], floor: [0.83, 0.7, 0.47],
  osb: [0.79, 0.65, 0.43], siding: [0.64, 0.36, 0.27], shingles: [0.3, 0.32, 0.35], door: [0.42, 0.29, 0.17],
  window: [0.62, 0.78, 0.9], vent: [0.88, 0.88, 0.86], gravel: [0.74, 0.71, 0.66], block: [0.6, 0.6, 0.6],
};

/** Paint colours for the siding; natural is the stained T1-11 look. */
export const SIDING_COLORS = {
  natural: [0.64, 0.36, 0.27], red: [0.62, 0.16, 0.13], pink: [0.96, 0.62, 0.76], gray: [0.6, 0.62, 0.62],
  blue: [0.38, 0.52, 0.66], green: [0.42, 0.55, 0.38], white: [0.93, 0.92, 0.88],
};

/** Signed area of a 2D polygon. @param {[number, number][]} pts */
function area2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/**
 * Ear-clipping triangulation of a simple polygon. Returns index triples.
 * @param {[number, number][]} input
 */
export function triangulate(input) {
  // Drop repeated and collinear points; they make zero-area ears.
  let pts = input.filter((p, i) => {
    const q = input[(i + input.length - 1) % input.length];
    return Math.abs(p[0] - q[0]) > 1e-9 || Math.abs(p[1] - q[1]) > 1e-9;
  });
  const idx = pts.map((_, i) => i);
  const ccw = area2(pts) > 0;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => {
    const d1 = cross(a, b, p); const d2 = cross(b, c, p); const d3 = cross(c, a, p);
    const hasNeg = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12;
    const hasPos = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;
    return !(hasNeg && hasPos);
  };
  /** @type {[number, number, number][]} */
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const c = cross(pts[ia], pts[ib], pts[ic]);
      if (Math.abs(c) < 1e-12) { idx.splice(i, 1); clipped = true; break; }
      if (ccw ? c < 0 : c > 0) continue;
      let ear = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inside(pts[j], pts[ia], pts[ib], pts[ic])) { ear = false; break; }
      }
      if (!ear) continue;
      tris.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return { pts, tris };
}

/** World point of profile point p at depth t. */
function world(g, p, t) {
  return [
    g.origin[0] + p[0] * g.u[0] + p[1] * g.v[0] + t * g.w[0],
    g.origin[1] + p[0] * g.u[1] + p[1] * g.v[1] + t * g.w[1],
    g.origin[2] + p[0] * g.u[2] + p[1] * g.v[2] + t * g.w[2],
  ];
}

/**
 * Triangles and outline segments for a list of solids.
 * @param {Solid[]} solids
 */
export function meshOf(solids) {
  const pos = []; const nor = []; const col = []; const lines = [];
  let dots = 0;
  const tri = (a, b, c, color) => {
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); col.push(color[0], color[1], color[2], dots); }
  };
  for (const s of solids) {
    const g = s.geom;
    dots = s.dots ? 1 : 0;
    const { pts, tris } = triangulate(g.profile);
    const front = pts.map((p) => world(g, p, 0));
    const back = pts.map((p) => world(g, p, g.thickness));
    for (const [a, b, c] of tris) { tri(front[a], front[b], front[c], s.color); tri(back[a], back[c], back[b], s.color); }
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      tri(front[i], front[j], back[j], s.color); tri(front[i], back[j], back[i], s.color);
      lines.push(...front[i], ...front[j], ...back[i], ...back[j], ...front[i], ...back[i]);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), lines: new Float32Array(lines) };
}

/** Colour and layer for each piece of a built shed. @param {import('./model.mjs').Shed} shed */
export function solidsOf(shed) {
  /** @type {Solid[]} */
  const out = [];
  for (const m of shed.members) {
    const layer = m.group === 'foundation' ? 'foundation' : m.group === 'floor' ? 'floor' : m.group === 'roof' ? 'roof' : 'walls';
    const color = /^PT /.test(m.material) ? COLORS.pt : (m.kind === 'header' || m.kind === 'ridge board') ? COLORS.header : COLORS.framing;
    out.push({ geom: m.geom, color: /** @type {any} */ (color), layer });
  }
  for (const p of shed.panels) {
    const layer = p.kind === 'floor sheet' ? 'floor' : p.kind === 'roof sheathing' ? 'sheathing' : 'siding';
    const siding = /** @type {any} */ (SIDING_COLORS)[shed.design.sidingColor] || COLORS.siding;
    const color = p.kind === 'floor sheet' ? COLORS.floor : p.kind === 'roof sheathing' ? COLORS.osb : siding;
    out.push({ geom: p.geom, color: /** @type {any} */ (color), layer, dots: p.kind === 'siding' && shed.design.polkaDots });
  }
  for (const f of shed.fixtures) {
    const layer = f.kind === 'shingles' ? 'roofing' : (f.kind === 'door' || f.kind === 'window' || f.kind === 'vent') ? 'siding' : 'foundation';
    out.push({ geom: f.geom, color: /** @type {any} */ (COLORS[f.kind === 'shingles' ? 'shingles' : f.kind] || COLORS.block), layer });
  }
  return out;
}

export const LAYERS = ['foundation', 'floor', 'walls', 'roof', 'sheathing', 'siding', 'roofing'];

// ---- tiny matrix helpers (column-major, like WebGL) ----
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2); const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(eye, at, up) {
  let zx = eye[0] - at[0]; let zy = eye[1] - at[1]; let zz = eye[2] - at[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy; let xy = up[2] * zx - up[0] * zz; let xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy; const yy = zz * xx - zx * xz; const yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

const VS = `attribute vec3 p; attribute vec3 n; attribute vec4 c; uniform mat4 m; uniform float bias; varying vec3 vn; varying vec4 vc; varying vec3 vp;
void main(){ gl_Position = m * vec4(p,1.0); gl_Position.z -= bias * gl_Position.w; vn = n; vc = c; vp = p; }`;
// Polka dots (vc.a = 1): 3 in purple dots on a 9 in grid in the face's own plane.
const FS = `precision highp float; varying vec3 vn; varying vec4 vc; varying vec3 vp; uniform float lit;
void main(){ vec3 n = normalize(vn); vec3 base = vc.rgb;
 if (vc.a > 0.5) { vec3 an = abs(n); vec2 uv = an.x > an.y ? (an.x > an.z ? vp.yz : vp.xy) : (an.y > an.z ? vp.xz : vp.xy);
  vec2 cell = floor(uv / 9.0); vec2 g = fract(uv / 9.0) - 0.5; if (mod(cell.y, 2.0) > 0.5) g = fract(uv / 9.0 + vec2(0.5, 0.0)) - 0.5;
  if (length(g) < 0.17) base = vec3(0.47, 0.23, 0.66); }
 float a = abs(dot(n, normalize(vec3(0.45,-0.6,0.75)))); float b = abs(dot(n, normalize(vec3(-0.6,0.5,0.3))));
 vec3 col = base * (0.42 + 0.5*a + 0.18*b); gl_FragColor = vec4(mix(base, col, lit), 1.0); }`;

/**
 * Attach a viewer to a canvas. Returns an object with `show(shed)`, `setLayer(name, on)`,
 * `snapshot()` and `reset()`, or null when WebGL is unavailable.
 * @param {HTMLCanvasElement} canvas
 */
export function createViewer(canvas) {
  const gl = /** @type {WebGLRenderingContext|null} */ (canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }));
  if (!gl) return null;
  const sh = (type, src) => { const s = /** @type {WebGLShader} */ (gl.createShader(type)); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  gl.useProgram(prog);
  const loc = { p: gl.getAttribLocation(prog, 'p'), n: gl.getAttribLocation(prog, 'n'), c: gl.getAttribLocation(prog, 'c'), m: gl.getUniformLocation(prog, 'm'), lit: gl.getUniformLocation(prog, 'lit'), bias: gl.getUniformLocation(prog, 'bias') };
  gl.enable(gl.DEPTH_TEST);

  /** @type {Record<string, any>} */
  const layers = {};
  const visible = new Set(LAYERS);
  const cam = { theta: -0.95, phi: 0.42, dist: 400, target: [0, 0, 0], fit: 400 };
  let fitted = false;

  const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };

  function show(shed, { refit = false } = {}) {
    for (const k of Object.keys(layers)) { const L = layers[k]; for (const b of [L.p, L.n, L.c, L.l, L.lc]) gl.deleteBuffer(b); delete layers[k]; }
    const solids = solidsOf(shed);
    for (const name of LAYERS) {
      const mesh = meshOf(solids.filter((s) => s.layer === name));
      if (!mesh.pos.length) continue;
      const lc = new Float32Array((mesh.lines.length / 3) * 4); for (let i = 0; i < lc.length; i += 4) { lc[i] = lc[i + 1] = lc[i + 2] = 0.25; }
      const ln = new Float32Array(mesh.lines.length).fill(0); for (let i = 2; i < ln.length; i += 3) ln[i] = 1;
      layers[name] = { p: buf(mesh.pos), n: buf(mesh.nor), c: buf(mesh.col), count: mesh.pos.length / 3, l: buf(mesh.lines), ln: buf(ln), lc: buf(lc), lcount: mesh.lines.length / 3 };
    }
    const d = shed.dims;
    cam.target = [d.length / 2, d.width / 2, d.peak / 2.4];
    cam.fit = Math.hypot(d.length + 2 * d.overhang, d.width + 2 * d.overhang, d.peak) * 1.35;
    if (!fitted || refit) { cam.dist = cam.fit; fitted = true; }
    draw();
  }

  function draw() {
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    // A canvas off the page (the compare thumbnails) keeps the size it was given.
    if (w && h && (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr))) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.93, 0.95, 0.97, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const eye = [cam.target[0] + cam.dist * Math.cos(cam.phi) * Math.cos(cam.theta), cam.target[1] + cam.dist * Math.cos(cam.phi) * Math.sin(cam.theta), cam.target[2] + cam.dist * Math.sin(cam.phi)];
    const m = mul(perspective(0.75, canvas.width / canvas.height, cam.dist * 0.08, cam.dist * 4), lookAt(eye, cam.target, [0, 0, 1]));
    gl.uniformMatrix4fv(loc.m, false, new Float32Array(m));
    const attr = (b, l, size = 3) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); };
    for (const name of LAYERS) {
      const L = layers[name];
      if (!L || !visible.has(name)) continue;
      gl.uniform1f(loc.lit, 1); gl.uniform1f(loc.bias, 0);
      attr(L.p, loc.p); attr(L.n, loc.n); attr(L.c, loc.c, 4);
      gl.drawArrays(gl.TRIANGLES, 0, L.count);
      gl.uniform1f(loc.lit, 0); gl.uniform1f(loc.bias, 0.00004);
      attr(L.l, loc.p); attr(L.ln, loc.n); attr(L.lc, loc.c, 4);
      gl.drawArrays(gl.LINES, 0, L.lcount);
    }
  }

  // Orbit with a pointer, zoom with the wheel.
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, theta: cam.theta, phi: cam.phi }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    cam.theta = drag.theta - (e.clientX - drag.x) * 0.008;
    cam.phi = Math.max(-0.15, Math.min(1.45, drag.phi + (e.clientY - drag.y) * 0.008));
    draw();
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  function zoom(f) { cam.dist = Math.max(cam.fit * 0.25, Math.min(cam.fit * 3, cam.dist * f)); draw(); }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => draw()).observe(canvas);

  return {
    show,
    draw,
    zoom,
    setLayer(name, on) { if (on) visible.add(name); else visible.delete(name); draw(); },
    view(theta, phi) { cam.theta = theta; cam.phi = phi; cam.dist = cam.fit; draw(); },
    reset() { cam.theta = -0.95; cam.phi = 0.42; cam.dist = cam.fit; draw(); },
    snapshot() { draw(); return canvas.toDataURL('image/png'); },
  };
}
