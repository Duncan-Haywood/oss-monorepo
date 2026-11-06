/**
 * Browser side of the 3D preview: draws the pillow mesh from `garment3d.mjs`
 * with WebGL1, the front and back drawings as textures, and an orbit camera
 * (drag to turn, wheel or pinch to zoom, arrow keys). Nothing leaves the page.
 * If WebGL is missing it says so and the flat turntable stays.
 */
import { GARMENTS, VIEWBOX } from "./catalogue.mjs";
import { renderDesign } from "./render.mjs";
import { buildGarmentMesh, orbitMatrix, rotationMatrix } from "./garment3d.mjs";

const VS = `attribute vec3 p; attribute vec3 n; attribute vec2 t;
uniform mat4 mvp; uniform mat4 rot; varying vec2 vt; varying vec3 vn;
void main(){ vt=t; vn=(rot*vec4(n,0.)).xyz; gl_Position=mvp*vec4(p,1.); }`;
const FS = `precision mediump float; uniform sampler2D tex; uniform sampler2D tex2; uniform float backFace;
varying vec2 vt; varying vec3 vn;
void main(){
  vec4 c = backFace>0.5 ? texture2D(tex2,vt) : texture2D(tex,vt);
  if(c.a<0.5) discard;
  vec3 N = normalize(vn); if(!gl_FrontFacing) N=-N;
  float key = max(dot(N, normalize(vec3(-0.4,0.6,0.7))),0.);
  float fill = max(dot(N, normalize(vec3(0.6,0.1,-0.5))),0.)*0.25;
  gl_FragColor = vec4(c.rgb*(0.62+0.55*key+fill), 1.);
}`;

function svgToImage(svg, size) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("drawing did not load"));
    img.width = size; img.height = Math.round(size * VIEWBOX.height / VIEWBOX.width);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

export function supportsWebGL() {
  try { return !!document.createElement("canvas").getContext("webgl"); } catch { return false; }
}

/** Mount a viewer in `host`. Returns { setDesign(design), spin(on), dispose(), state }. */
export function mountViewer(host, { size = 1024 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 560; canvas.height = 600;
  canvas.style.cssText = "width:100%;max-width:560px;touch-action:none;border-radius:8px;background:#f4f1ea;cursor:grab";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "3D garment preview. Drag to turn, scroll to zoom, arrow keys turn.");
  host.replaceChildren(canvas);
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  const state = { yaw: 0.5, pitch: 0.12, distance: 950, ready: false, triangles: 0 };
  if (!gl) { host.textContent = "This browser has no WebGL, so the 3D preview is off. The flat turntable above still works."; return { setDesign() {}, spin() {}, dispose() {}, state }; }
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);
  const loc = { p: gl.getAttribLocation(prog, "p"), n: gl.getAttribLocation(prog, "n"), t: gl.getAttribLocation(prog, "t") };
  const U = k => gl.getUniformLocation(prog, k);
  const bufs = {};
  const upload = (name, data, target = gl.ARRAY_BUFFER) => { bufs[name] ??= gl.createBuffer(); gl.bindBuffer(target, bufs[name]); gl.bufferData(target, data, gl.STATIC_DRAW); };
  const tex = [gl.createTexture(), gl.createTexture()];
  let count = 0, frontCount = 0, meshKey = "";
  const mask = document.createElement("canvas").getContext("2d");

  function setTexture(i, img) {
    gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[i]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function setMesh(garmentId) {
    if (meshKey === garmentId) return;
    meshKey = garmentId;
    const path = new Path2D(GARMENTS[garmentId].outline.front);
    const m = buildGarmentMesh((x, y) => mask.isPointInPath(path, x, y), { armDrop: 0.3 });
    upload("p", m.positions); upload("n", m.normals); upload("t", m.uvs);
    upload("i", m.indices, gl.ELEMENT_ARRAY_BUFFER);
    count = m.indices.length; frontCount = m.frontCount; state.triangles = m.triangleCount;
  }

  let token = 0;
  async function setDesign(design) {
    const my = ++token;
    try {
      const [f, b] = await Promise.all(["front", "back"].map(side =>
        svgToImage(renderDesign(design, { side, uid: "gl" + side, guides: false }), size)));
      if (my !== token) return;
      setMesh(design.garment); setTexture(0, f); setTexture(1, b);
      state.ready = true; draw();
    } catch (e) { host.dataset.error = String(e.message || e); }
  }

  function draw() {
    if (!state.ready) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.957, 0.945, 0.918, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    const mvp = orbitMatrix({ yaw: state.yaw, pitch: state.pitch, distance: state.distance, aspect: canvas.width / canvas.height });
    gl.uniformMatrix4fv(U("mvp"), false, mvp);
    gl.uniformMatrix4fv(U("rot"), false, rotationMatrix(state.yaw, state.pitch));
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.p); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.n); gl.enableVertexAttribArray(loc.n); gl.vertexAttribPointer(loc.n, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.t); gl.enableVertexAttribArray(loc.t); gl.vertexAttribPointer(loc.t, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.i);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[0]); gl.uniform1i(U("tex"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[1]); gl.uniform1i(U("tex2"), 1);
    // front triangles use the front drawing, back triangles the back drawing
    gl.uniform1f(U("backFace"), 0);
    gl.drawElements(gl.TRIANGLES, frontCount, gl.UNSIGNED_INT, 0);
    gl.uniform1f(U("backFace"), 1);
    gl.drawElements(gl.TRIANGLES, count - frontCount, gl.UNSIGNED_INT, frontCount * 4);
  }
  const ext = gl.getExtension("OES_element_index_uint");
  if (!ext) { host.textContent = "This browser's WebGL cannot draw the garment mesh; the flat turntable still works."; return { setDesign() {}, spin() {}, dispose() {}, state }; }

  // drag / wheel / keys
  let drag = null, raf = 0, timer = null;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
  canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    state.yaw += (e.clientX - drag.x) * 0.01; state.pitch += (e.clientY - drag.y) * 0.006;
    state.pitch = Math.max(-0.6, Math.min(0.6, state.pitch));
    drag = { x: e.clientX, y: e.clientY }; redraw();
  });
  const end = () => { drag = null; canvas.style.cursor = "grab"; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", e => { e.preventDefault(); state.distance = Math.max(500, Math.min(1800, state.distance * (1 + Math.sign(e.deltaY) * 0.08))); redraw(); }, { passive: false });
  canvas.addEventListener("keydown", e => {
    const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] }[e.key];
    if (!k) return; e.preventDefault(); state.yaw += k[0]; state.pitch = Math.max(-0.6, Math.min(0.6, state.pitch + k[1])); redraw();
  });
  return {
    setDesign, state, draw,
    spin(on) { clearInterval(timer); timer = on ? setInterval(() => { state.yaw += 0.05; draw(); }, 40) : null; },
    dispose() { clearInterval(timer); cancelAnimationFrame(raf); },
  };
}
