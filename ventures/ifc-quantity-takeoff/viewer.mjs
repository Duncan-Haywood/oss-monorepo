// A small WebGL model view: no library, z up, metres.
//
//   const v = new ModelView(canvas, { onPick(id) {} });
//   v.add(id, { positions, normals });   // Float32Array triangles, any number of calls
//   v.setColors((id) => [r, g, b]);       // 0..1, recoloured without re-uploading geometry
//   v.fit(ids?);                          // frame what is shown, or some elements
//   v.setVisible((id) => bool);           // hide elements (storeys), null shows all
//   v.setSection([nx, ny, nz, w]);        // cut away n.p > w; null for no cut
//
// Drag to orbit, shift-drag or right-drag to pan, wheel or pinch to zoom,
// click or tap to pick (an id buffer read back at the pointer).

// The section plane is a per-fragment discard on the position the vertex
// shader passes through (in metres about the model's origin, so highp keeps
// it to well under a millimetre where the device has it). Cut faces are left
// open: the view has no caps, and an element's inside reads as its colour.
const VS = `attribute vec3 p; attribute vec3 n; attribute vec3 c;
uniform mat4 m; varying vec3 vc; varying vec3 vn; varying vec3 vp;
void main() { gl_Position = m * vec4(p, 1.0); vc = c; vn = n; vp = p; }`;
const PREC = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vc; varying vec3 vn; varying vec3 vp; uniform vec4 cut; uniform float cutOn;
`;
const CUT = `if (cutOn > 0.5 && dot(cut.xyz, vp) > cut.w) discard;`;
const FS = `${PREC}uniform vec3 l;
void main() { ${CUT} float d = abs(dot(normalize(vn), l)); gl_FragColor = vec4(vc * (0.45 + 0.55 * d), 1.0); }`;
const PICK_FS = `${PREC}void main() { ${CUT} gl_FragColor = vec4(vc, 1.0); }`;

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

/**
 * The vertex ranges [start, count] that draw the items the predicate keeps,
 * neighbours merged, so showing one storey of a model costs a handful of
 * draw calls rather than one per element.
 */
export function visibleRuns(items, shown) {
  const runs = [];
  for (const it of items) {
    if (it.start == null || (shown && !shown(it.id))) continue; // not uploaded yet, or hidden
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === it.start) last[1] += it.count;
    else runs.push([it.start, it.count]);
  }
  return runs;
}

/** The box round some items: [x0, y0, z0, x1, y1, z1], or null for none. */
export function boxOfItems(list) {
  if (!list.length) return null;
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const it of list) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], it.box[k]); b[k + 3] = Math.max(b[k + 3], it.box[k + 3]); }
  return b;
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
    this.shown = null; // null: every element
    this.runs = [];
    this.section = null;
    this.onPick = onPick || (() => {});
    this.cam = { az: -0.8, el: 0.55, dist: 30, target: [0, 0, 0] };
    this.dirty = true;
    this.buffers = { p: gl.createBuffer(), n: gl.createBuffer(), c: gl.createBuffer(), id: gl.createBuffer() };
    this.vertexCount = 0; this.uploaded = 0; this.cap = 0;
    this._wire();
    this._loop = () => { if (this.dirty) this.draw(); this.raf = requestAnimationFrame(this._loop); };
    this.raf = requestAnimationFrame(this._loop);
  }

  clear() { this.items = []; this.slot.clear(); this.vertexCount = 0; this.uploaded = 0; this.cap = 0; this.runs = []; this.dirty = true; }

  add(id, mesh) {
    if (!mesh || !mesh.positions.length) return;
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const P = mesh.positions;
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < b[k]) b[k] = v; if (v > b[k + 3]) b[k + 3] = v; }
    this.slot.set(id, this.items.length);
    this.items.push({ id, positions: P, normals: mesh.normals, box: b });
  }

  /**
   * Uploads what add() collected since the last call. The GPU buffers grow
   * by doubling and only the new elements are written into them, so a
   * model drawn as it streams in costs its size once, not once a commit
   * (re-uploading a 1.8M-triangle model each second held the page up to
   * 0.9 s at a time).
   */
  commit() {
    if (this.uploaded === this.items.length) return;
    const gl = this.gl;
    const fresh = this.items.slice(this.uploaded);
    let v = this.vertexCount;
    for (const it of fresh) { it.start = v; it.count = it.positions.length / 3; v += it.count; }
    if (v > this.cap) {
      this.cap = Math.max(v, this.cap * 2, 1 << 16);
      for (const [buf, bytes, usage] of [[this.buffers.p, 12, gl.STATIC_DRAW], [this.buffers.n, 3, gl.STATIC_DRAW], [this.buffers.id, 3, gl.STATIC_DRAW], [this.buffers.c, 3, gl.DYNAMIC_DRAW]]) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, this.cap * bytes, usage);
      }
      this._write(this.items, 0, this.items.length); // a new buffer starts empty
    } else this._write(this.items, this.uploaded, this.items.length);
    this.uploaded = this.items.length;
    this.vertexCount = v;
    this.runs = visibleRuns(this.items, this.shown);
    this.dirty = true;
  }

  // writes items [from, to) into the GPU buffers at their own offsets:
  // positions as floats; normals, colours and pick ids as bytes (a 2M-triangle
  // steel model is 72 MB of positions, and would be four times that all in floats)
  _write(items, from, to) {
    if (from >= to) return;
    const gl = this.gl;
    const v0 = items[from].start, v1 = items[to - 1].start + items[to - 1].count, n = (v1 - v0) * 3;
    const P = new Float32Array(n), N = new Int8Array(n), I = new Uint8Array(n), C = new Uint8Array(n);
    for (let i = from; i < to; i++) {
      const it = items[i], o = (it.start - v0) * 3;
      P.set(it.positions, o);
      const nm = it.normals;
      for (let k = 0; k < nm.length; k++) N[o + k] = Math.round(nm[k] * 127);
      const id = idColor(i).map((x) => Math.round(x * 255));
      const c = this._rgb(it.id);
      for (let k = 0; k < it.positions.length; k += 3) {
        I[o + k] = id[0]; I[o + k + 1] = id[1]; I[o + k + 2] = id[2];
        C[o + k] = c[0]; C[o + k + 1] = c[1]; C[o + k + 2] = c[2];
      }
    }
    for (const [buf, data, bytes] of [[this.buffers.p, P, 12], [this.buffers.n, N, 3], [this.buffers.id, I, 3], [this.buffers.c, C, 3]]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, v0 * bytes, data);
    }
  }

  _rgb(id) { return (this.colorOf(id) || [0.75, 0.75, 0.75]).map((v) => Math.round(v * 255)); }

  setColors(fn) { this.colorOf = fn; this._recolor(); }

  _recolor() {
    const gl = this.gl;
    if (!this.vertexCount) { this.dirty = true; return; }
    const C = new Uint8Array(this.vertexCount * 3);
    for (let i = 0; i < this.uploaded; i++) {
      const it = this.items[i], c = this._rgb(it.id);
      for (let k = 0, o = it.start * 3; k < it.count; k++, o += 3) { C[o] = c[0]; C[o + 1] = c[1]; C[o + 2] = c[2]; }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.c); gl.bufferSubData(gl.ARRAY_BUFFER, 0, C);
    this.dirty = true;
  }

  /** Shows only the elements shown(id) keeps; null shows them all. */
  setVisible(shown) {
    this.shown = shown || null;
    this.runs = visibleRuns(this.items, this.shown);
    this.dirty = true;
  }

  isShown(id) { return this.slot.has(id) && (!this.shown || this.shown(id)); }

  /** Cuts away every fragment with n.p > w ([nx, ny, nz, w], view coordinates); null removes the cut. */
  setSection(plane) { this.section = plane || null; this.dirty = true; }

  /** The box round the shown elements (or all of them, with all = true). */
  bounds(all = false) { return boxOfItems(all ? this.items : this.items.filter((it) => this.isShown(it.id))); }

  /** Frames the shown elements, or the ones in ids. */
  fit(ids) {
    let list = ids ? [...ids].map((id) => this.items[this.slot.get(id)]).filter(Boolean) : this.items.filter((it) => this.isShown(it.id));
    if (!list.length) list = this.items;
    const b = boxOfItems(list);
    if (!b) return;
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
    gl.uniform1f(gl.getUniformLocation(prog, "cutOn"), this.section ? 1 : 0);
    gl.uniform4fv(gl.getUniformLocation(prog, "cut"), new Float32Array(this.section || [0, 0, 1, 0]));
  }

  _drawRuns() { for (const [start, count] of this.runs) this.gl.drawArrays(this.gl.TRIANGLES, start, count); }

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
