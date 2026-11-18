// @ts-check
// The shed as a 3D model file: binary glTF 2.0 (.glb), the open Khronos format
// that Blender, Windows 3D Viewer, three.js and <model-viewer> open directly.
// Every board, sheet and fixture the 3D view draws is its own named node
// ("Rafter RF1, 2x6"), grouped under one node per layer (foundation,
// floor, walls, roof, sheathing, siding, roofing, trim ...), so a layer can be
// hidden or a single stud selected in the program that opens it. The geometry
// is the same extruded profiles the viewer draws (`solidsOf`, `meshOf`), at
// full size in metres, Y up as glTF asks (the model's z is up, in inches).
// No library: the writer below packs the JSON and binary chunks itself.

import { solidsOf, meshOf } from './render3d.mjs';
import { describePiece } from './xref.mjs';

const M_PER_IN = 0.0254;
const LAYER_NAMES = /** @type {Record<string, string>} */ ({
  foundation: 'Foundation', floor: 'Floor', walls: 'Walls', 'front wall': 'Front wall', roof: 'Roof framing',
  sheathing: 'Sheathing', siding: 'Siding, doors and windows', roofing: 'Roofing', trim: 'Trim',
  interior: 'Interior lining', 'front lining': 'Front wall lining', decor: 'Decor',
});
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * A readable name for each piece id: framing members by kind, mark and stock,
 * the rest as the click panel names them.
 * @param {any} shed
 */
function namesOf(shed) {
  /** @type {Map<string, string>} */
  const names = new Map();
  for (const m of shed.members || []) names.set(m.id, `${cap(m.kind)} ${m.id}${m.material ? `, ${m.material}` : ''}`);
  return (id) => names.get(id) || (id && describePiece(shed, id)) || id || 'piece';
}

/** Model point (inches, z up) to glTF (metres, y up), keeping the handedness. */
const toGltf = (x, y, z) => [x * M_PER_IN, z * M_PER_IN, -y * M_PER_IN];

/** sRGB colour component (as the viewer's colours are) to the linear value glTF's baseColorFactor takes. */
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * The glTF document (JSON part) and its binary buffer for a built shed.
 * @param {any} shed a buildShed() result
 * @param {{ name?: string, layers?: string[] }} [opts] layers: only these (default every layer)
 */
export function shedGltf(shed, opts = {}) {
  const solids = solidsOf(shed).filter((s) => !opts.layers || opts.layers.includes(s.layer));
  const nameOf = namesOf(shed);
  const glass = 256; // FINISH.glass in render3d.mjs
  /** @type {any[]} */ const materials = [];
  /** @type {Map<string, number>} */ const matIndex = new Map();
  const materialFor = (color, flags) => {
    const isGlass = (flags & glass) !== 0;
    const key = `${color.map((c) => c.toFixed(3)).join(',')}${isGlass ? ':glass' : ''}`;
    if (!matIndex.has(key)) {
      matIndex.set(key, materials.length);
      materials.push({
        name: isGlass ? 'Glass' : `#${color.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}`,
        pbrMetallicRoughness: { baseColorFactor: [...color.map(linear), isGlass ? 0.45 : 1], metallicFactor: 0, roughnessFactor: isGlass ? 0.1 : 0.85 },
        // The profiles' outer faces are not all wound one way; drawing both sides keeps every face visible.
        doubleSided: true,
        ...(isGlass ? { alphaMode: 'BLEND' } : {}),
      });
    }
    return /** @type {number} */ (matIndex.get(key));
  };

  /** @type {number[][]} */ const chunks = []; // Float32 data, in order
  let byteOffset = 0;
  /** @type {any[]} */ const bufferViews = [];
  /** @type {any[]} */ const accessors = [];
  const addVec3 = (data) => {
    const count = data.length / 3;
    const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < data.length; i++) { const k = i % 3; if (data[i] < min[k]) min[k] = data[i]; if (data[i] > max[k]) max[k] = data[i]; }
    bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length * 4, target: 34962 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count, type: 'VEC3', min, max });
    chunks.push(data);
    byteOffset += data.length * 4;
    return accessors.length - 1;
  };

  /** @type {any[]} */ const meshes = [];
  /** @type {any[]} */ const nodes = [];
  /** @type {Map<string, number[]>} */ const layerChildren = new Map();
  for (const s of solids) {
    const m = meshOf([s]);
    if (!m.pos.length) continue;
    const pos = []; const nor = [];
    for (let i = 0; i < m.pos.length; i += 3) {
      pos.push(...toGltf(m.pos[i], m.pos[i + 1], m.pos[i + 2]));
      const n = toGltf(m.nor[i], m.nor[i + 1], m.nor[i + 2]);
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      nor.push(n[0] / l, n[1] / l, n[2] / l);
    }
    const name = nameOf(s.id);
    meshes.push({ name, primitives: [{ attributes: { POSITION: addVec3(pos), NORMAL: addVec3(nor) }, material: materialFor(s.color, s.flags || 0), mode: 4 }] });
    nodes.push({ name, mesh: meshes.length - 1 });
    if (!layerChildren.has(s.layer)) layerChildren.set(s.layer, []);
    /** @type {number[]} */ (layerChildren.get(s.layer)).push(nodes.length - 1);
  }
  const layerNodes = [];
  for (const [layer, children] of layerChildren) {
    nodes.push({ name: LAYER_NAMES[layer] || cap(layer), children });
    layerNodes.push(nodes.length - 1);
  }
  nodes.push({ name: opts.name || shed.design?.name || 'Shed', children: layerNodes });
  const root = nodes.length - 1;

  const bin = new Float32Array(byteOffset / 4);
  let at = 0;
  for (const c of chunks) { bin.set(c, at); at += c.length; }
  const json = {
    asset: { version: '2.0', generator: 'Shed Designer (MIT), https://marisstella.app/shed-designer/' },
    scene: 0,
    scenes: [{ name: opts.name || shed.design?.name || 'Shed', nodes: [root] }],
    nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: bin.byteLength }],
  };
  return { json, bin: new Uint8Array(bin.buffer) };
}

/**
 * The shed as one binary glTF (.glb) file.
 * @param {any} shed @param {{ name?: string, layers?: string[] }} [opts]
 * @returns {Uint8Array}
 */
export function shedGlb(shed, opts = {}) {
  const { json, bin } = shedGltf(shed, opts);
  const pad4 = (n) => (n + 3) & ~3;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(jsonBytes.length);
  const binLen = pad4(bin.length);
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen); // the JSON chunk pads with spaces
  const b = 20 + jsonLen;
  dv.setUint32(b, binLen, true);
  dv.setUint32(b + 4, 0x004e4942, true); // 'BIN\0'
  out.set(bin, b + 8);
  return out;
}

/**
 * Read a .glb back (header, JSON and binary chunk), for tests and checks.
 * @param {Uint8Array} glb
 */
export function readGlb(glb) {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb: bad magic');
  if (dv.getUint32(4, true) !== 2) throw new Error('not glTF 2');
  if (dv.getUint32(8, true) !== glb.byteLength) throw new Error('length field does not match the file');
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error('first chunk is not JSON');
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)));
  const b = 20 + jsonLen;
  const binLen = dv.getUint32(b, true);
  if (dv.getUint32(b + 4, true) !== 0x004e4942) throw new Error('second chunk is not BIN');
  const bin = glb.subarray(b + 8, b + 8 + binLen);
  return { json, bin, jsonLen, binLen };
}
