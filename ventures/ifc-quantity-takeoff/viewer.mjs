// A small WebGL model view: no library, z up, metres.
//
//   const v = new ModelView(canvas, { onPick(id) {} });
//   v.add(id, { positions, normals });   // Float32Array triangles, any number of calls
//   v.setColors((id) => [r, g, b]);       // 0..1, recoloured without re-uploading geometry
//   v.fit(ids?);                          // frame everything shown, or some elements
//   v.setVisible((id) => bool);           // hide elements (a storey, a class) without re-uploading
//   v.setSection({ n: [nx, ny, nz], d });  // cut away the side where n.p > d; null for none
//
// Drag to orbit, shift-drag or right-drag to pan, wheel or pinch to zoom,
// click or tap to pick (an id buffer read back at the pointer).

// The section plane discards what lies past it. A face seen from behind
// (its normal points away from the eye) is the inside of a cut solid, and is
// drawn flat grey as a cut face would be on a drawing. The mesher writes
// outward normals (view-mesh.mjs: every closed element encloses a positive volume).
const VS = `attribute vec3 p; attribute vec3 n; attribute vec3 c;
uniform mat4 m; varying vec3 vc; varying vec3 vn; varying vec3 vp;
void main() { gl_Position = m * vec4(p, 1.0); vc = c; vn = n; vp = p; }`;
const FS = `precision highp float; varying vec3 vc; varying vec3 vn; varying vec3 vp; uniform vec3 l; uniform vec4 cut; uniform vec3 eye;
void main() {
  if (dot(cut.xyz, vp) > cut.w) discard;
  if (cut.xyz != vec3(0.0) && dot(vn, eye - vp) < 0.0) { gl_FragColor = vec4(0.32, 0.33, 0.36, 1.0); return; }
  float d = abs(dot(normalize(vn), l)); gl_FragColor = vec4(vc * (0.45 + 0.55 * d), 1.0);
}`;
const PICK_FS = `precision highp float; varying vec3 vc; varying vec3 vn; varying vec3 vp; uniform vec4 cut;
void main() { if (dot(cut.xyz, vp) > cut.w) discard; gl_FragColor = vec4(vc, 1.0); }`;

/**
 * The [start, count] vertex ranges to draw: consecutive visible items merged,
 * so a whole model shown is one draw call and a storey hidden is a few.
 */
export function visibleRuns(items, visible) {
  const runs = [];
  for (const it of items) {
    if (visible && !visible(it.id)) continue;
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === it.start) last[1] += it.count;
    else runs.push([it.start, it.count]);
  }
  return runs;
}

/**
 * A section plane from the page's controls. axis "z" cuts away everything
 * above height t of the box (a plan cut); "x"/"y" cut away the far side of a
 * vertical plane at fraction t across (flip keeps the other side instead).
 * box is [x0, y0, z0, x1, y1, z1] in view coordinates; t runs 0..1.
 */
export function sectionPlane(axis, t, box, flip = false) {
  const k = { x: 0, y: 1, z: 2 }[axis];
  if (k == null || !box) return null;
  const at = box[k] + (box[k + 3] - box[k]) * Math.max(0, Math.min(1, t));
  const n = [0, 0, 0];
  n[k] = flip ? -1 : 1;
  return { n, d: flip ? -at : at };
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// column-major 4x4 helpers
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(e, t, up) {
  let z = [e[0] - t[0], e[1] - t[1], e[2] - t[2]];
  let l = Math.hypot(...z); z = z.map((v) => v / l);
  let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  l = Math.hypot(...x) || 1; x = x.map((v) => v / l);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
}
function mul4(a, b) {
  const o = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
    o[i * 4 + j] = s;
  }
  return o;
}

/** The colour that encodes element slot i in the pick buffer, and back. */
export const idColor = (i) => [((i + 1) & 255) / 255, (((i + 1) >> 8) & 255) / 255, (((i + 1) >> 16) & 255) / 255];
export const colorId = (r, g, b) => (r | (g << 8) | (b << 16)) - 1;

export class ModelView {
  constructor(canvas, { onPick } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL is not available in this browser");
    this.gl = gl;
    this.prog = program(gl, VS, FS);
    this.pickProg = program(gl, VS, PICK_FS);
    this.items = []; // { id, positions, normals, start, count, box }
    this.slot = new Map();
    this.colorOf = () => [0.75, 0.75, 0.75];
    this.visible = null; // (id) => bool, or null for all
    this.section = null; // { n, d }
    this.runs = [];
    this.onPick = onPick || (() => {});
    this.cam = { az: -0.8, el: 0.55, dist: 30, target: [0, 0, 0] };
    this.dirty = true;
    this.buffers = { p: gl.createBuffer(), n: gl.createBuffer(), c: gl.createBuffer(), id: gl.createBuffer() };
    this.vertexCount = 0;
    this._wire();
    this._loop = () => { if (this.dirty) this.draw(); this.raf = requestAnimationFrame(this._loop); };
    this.raf = requestAnimationFrame(this._loop);
  }

  clear() { this.items = []; this.slot.clear(); this.vertexCount = 0; this._upload(); }

  add(id, mesh) {
    if (!mesh || !mesh.positions.length) return;
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const P = mesh.positions;
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < b[k]) b[k] = v; if (v > b[k + 3]) b[k + 3] = v; }
    this.slot.set(id, this.items.length);
    this.items.push({ id, positions: P, normals: mesh.normals, box: b });
    this.pending = true;
  }

  /** Uploads what add() collected since the last call. */
  commit() { if (this.pending) { this.pending = false; this._upload(); } }

  _upload() {
    const gl = this.gl;
    let n = 0;
    for (const it of this.items) n += it.positions.length;
    // positions as floats; normals, colours and pick ids as bytes (a 2M-triangle
    // steel model is 72 MB of positions, and would be four times that all in floats)
    const P = new Float32Array(n), N = new Int8Array(n), I = new Uint8Array(n);
    let o = 0;
    this.items.forEach((it, i) => {
      it.start = o / 3; it.count = it.positions.length / 3;
      P.set(it.positions, o);
      const nm = it.normals;
      for (let k = 0; k < nm.length; k++) N[o + k] = Math.round(nm[k] * 127);
      const c = idColor(i).map((v) => Math.round(v * 255));
      for (let k = 0; k < it.positions.length; k += 3) { I[o + k] = c[0]; I[o + k + 1] = c[1]; I[o + k + 2] = c[2]; }
      o += it.positions.length;
    });
    this.vertexCount = n / 3;
    this.runs = visibleRuns(this.items, this.visible);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.p); gl.bufferData(gl.ARRAY_BUFFER, P, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.n); gl.bufferData(gl.ARRAY_BUFFER, N, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.id); gl.bufferData(gl.ARRAY_BUFFER, I, gl.STATIC_DRAW);
    this._recolor();
  }

  setColors(fn) { this.colorOf = fn; this._recolor(); }

  /** Shows only the elements fn(id) is true for (null shows all); no re-upload. */
  setVisible(fn) { this.visible = fn; this.runs = visibleRuns(this.items, fn); this.dirty = true; }

  /** Cuts away the side of the plane n.p > d (view coordinates); null removes the cut. */
  setSection(plane) { this.section = plane; this.dirty = true; }

  /** The box round the elements shown (or all, when none are), view coordinates. */
  bounds(all = false) {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const it of this.items) {
      if (!all && this.visible && !this.visible(it.id)) continue;
      for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], it.box[k]); b[k + 3] = Math.max(b[k + 3], it.box[k + 3]); }
    }
    return Number.isFinite(b[0]) ? b : null;
  }

  _recolor() {
    const gl = this.gl;
    const C = new Uint8Array(this.vertexCount * 3);
    for (const it of this.items) {
      const c = (this.colorOf(it.id) || [0.75, 0.75, 0.75]).map((v) => Math.round(v * 255));
      for (let k = 0, o = it.start * 3; k < it.count; k++, o += 3) { C[o] = c[0]; C[o + 1] = c[1]; C[o + 2] = c[2]; }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.c); gl.bufferData(gl.ARRAY_BUFFER, C, gl.DYNAMIC_DRAW);
    this.dirty = true;
  }

  /** Frames the elements shown, or the ones in ids. */
  fit(ids) {
    let list = ids ? [...ids].map((id) => this.items[this.slot.get(id)]).filter(Boolean) : this.items;
    if (!ids && this.visible) list = list.filter((it) => this.visible(it.id));
    if (!list.length) return;
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const it of list) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], it.box[k]); b[k + 3] = Math.max(b[k + 3], it.box[k + 3]); }
    this.cam.target = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    const r = Math.max(Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2, 0.5);
    this.cam.dist = r / Math.tan(Math.PI / 8) * 0.95;
    this.dirty = true;
  }

  _matrix() {
    const { az, el, dist, target } = this.cam;
    const eye = [target[0] + dist * Math.cos(el) * Math.cos(az), target[1] + dist * Math.cos(el) * Math.sin(az), target[2] + dist * Math.sin(el)];
    const w = this.canvas.width, h = this.canvas.height;
    this.eye = eye;
    return mul4(perspective(Math.PI / 4, w / Math.max(h, 1), dist / 500, dist * 20), lookAt(eye, target, [0, 0, 1]));
  }

  _resize() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  _bind(prog, colorBuffer) {
    const gl = this.gl;
    gl.useProgram(prog);
    for (const [name, buf, type] of [["p", this.buffers.p, gl.FLOAT], ["n", this.buffers.n, gl.BYTE], ["c", colorBuffer, gl.UNSIGNED_BYTE]]) {
      const loc = gl.getAttribLocation(prog, name);
      if (loc < 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, type, type !== gl.FLOAT, 0, 0);
    }
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, "m"), false, new Float32Array(this._matrix()));
    const c = this.section;
    gl.uniform4fv(gl.getUniformLocation(prog, "cut"), new Float32Array(c ? [...c.n, c.d] : [0, 0, 0, 1]));
    const e = gl.getUniformLocation(prog, "eye");
    if (e) gl.uniform3fv(e, new Float32Array(this.eye));
  }

  _drawRuns() { for (const [s, n] of this.runs) this.gl.drawArrays(this.gl.TRIANGLES, s, n); }

  draw() {
    this.dirty = false;
    this._resize();
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.vertexCount) return;
    this._bind(this.prog, this.buffers.c);
    const { az, el } = this.cam;
    // light from over the viewer's shoulder
    const l = [Math.cos(el + 0.4) * Math.cos(az + 0.5), Math.cos(el + 0.4) * Math.sin(az + 0.5), Math.sin(el + 0.4)];
    gl.uniform3fv(gl.getUniformLocation(this.prog, "l"), new Float32Array(l));
    this._drawRuns();
  }

  /** The element id drawn at canvas pixel (x, y) in CSS pixels, or null. */
  pick(x, y) {
    if (!this.vertexCount) return null;
    const gl = this.gl;
    this._resize();
    const dpr = this.canvas.width / Math.max(this.canvas.clientWidth, 1);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DITHER);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this._bind(this.pickProg, this.buffers.id);
    this._drawRuns();
    const px = new Uint8Array(4);
    gl.readPixels(Math.round(x * dpr), Math.round(this.canvas.height - y * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.enable(gl.DITHER);
    this.dirty = true;
    const i = colorId(px[0], px[1], px[2]);
    return i >= 0 && i < this.items.length ? this.items[i].id : null;
  }

  _wire() {
    const c = this.canvas;
    const pts = new Map();
    let moved = 0, last = null, pinch = null;
    c.style.touchAction = "none";
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("pointerdown", (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; last = [e.clientX, e.clientY]; pinch = null; });
    c.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.cam.dist *= pinch / d;
        pinch = d; moved += 10; this.dirty = true;
        return;
      }
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      moved += Math.abs(dx) + Math.abs(dy);
      if (e.shiftKey || e.buttons === 2 || e.buttons === 4) {
        // pan in the view plane
        const s = this.cam.dist / c.clientHeight * 0.83;
        const { az } = this.cam;
        const right = [-Math.sin(az), Math.cos(az), 0];
        const up = [-Math.cos(az) * Math.sin(this.cam.el), -Math.sin(az) * Math.sin(this.cam.el), Math.cos(this.cam.el)];
        for (let k = 0; k < 3; k++) this.cam.target[k] += (-dx * right[k] + dy * up[k]) * s;
      } else {
        this.cam.az -= dx * 0.008;
        this.cam.el = Math.max(-1.5, Math.min(1.5, this.cam.el + dy * 0.008));
      }
      this.dirty = true;
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0 && moved < 5 && e.type === "pointerup") {
        const r = c.getBoundingClientRect();
        this.onPick(this.pick(e.clientX - r.left, e.clientY - r.top));
      }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("wheel", (e) => { e.preventDefault(); this.cam.dist *= Math.exp(e.deltaY * 0.001); this.dirty = true; }, { passive: false });
    window.addEventListener("resize", () => { this.dirty = true; });
  }
}
