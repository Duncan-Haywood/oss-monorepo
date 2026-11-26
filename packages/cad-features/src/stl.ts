// STL (binary and ASCII) triangle meshes: bounding box, surface area, and the volume of a closed mesh.
//
// An STL file carries no units, no holes and no curved faces: only triangles, each three corner points.
// So the units are always assumed (`assumeUnits`, default mm) and flagged; the volume is the volume of
// the facets, which sits a little inside a curved part; and it is given only when the mesh is closed:
// every edge shared by exactly two triangles that run it in opposite directions. Anything else (a gap,
// a T-junction, a flipped triangle) leaves the volume null with a flag saying why, never a guess.
//
// Volume of a closed mesh: the signed volumes of the tetrahedra from the origin to each triangle add up
// to the enclosed volume (the divergence theorem); outward-facing triangles give a positive total.
// Corners are joined by their exact coordinates, as the exporter wrote them, which is how every CAD
// exporter writes a shared corner. Pure; no Node APIs.

import type {
  BoundingBox,
  Confidence,
  ExtractOptions,
  Flag,
  LengthUnit,
  PartFeatures,
  SolidBody,
} from "./types.ts";
import { MM_PER } from "./types.ts";

/** Meshes above this many triangles are not measured (a Worker request has little CPU). */
export const MAX_STL_TRIANGLES = 500_000;

export class StlError extends Error {}

interface Mesh {
  /** flat x, y, z per triangle corner: 9 numbers per triangle */
  coords: Float64Array;
  triangles: number;
  kind: "binary" | "ascii";
  name: string;
}

/**
 * True when the bytes are a binary STL: an 80-byte header, a little-endian triangle count, then 50
 * bytes per triangle. Checked by size, not by the header: a binary header may itself start "solid".
 */
export function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.length < 84) return false;
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
  return bytes.length === 84 + 50 * n;
}

/** True when text reads like an ASCII STL ("solid ..." then "facet normal" lines). */
export function looksLikeAsciiStl(text: string): boolean {
  const head = text.slice(0, 4096);
  return /^\s*solid\b/i.test(head) && /\bfacet\s+normal\b/i.test(head);
}

function readBinary(bytes: Uint8Array): Mesh {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint32(80, true);
  if (n > MAX_STL_TRIANGLES)
    throw new StlError(`${n} triangles; meshes over ${MAX_STL_TRIANGLES} are not measured.`);
  const coords = new Float64Array(n * 9);
  for (let t = 0; t < n; t++) {
    const base = 84 + 50 * t + 12; // skip the stored normal: it is recomputed from the corners
    for (let k = 0; k < 9; k++) coords[t * 9 + k] = dv.getFloat32(base + 4 * k, true);
  }
  let name = "";
  for (let i = 0; i < 80 && bytes[i] !== 0; i++) name += String.fromCharCode(bytes[i] as number);
  return { coords, triangles: n, kind: "binary", name: name.replace(/^solid\s*/i, "").trim() };
}

function readAscii(text: string): Mesh {
  const name = /^\s*solid[ \t]*([^\r\n]*)/i.exec(text)?.[1]?.trim() ?? "";
  const out: number[] = [];
  const re = /\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const xyz = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!xyz.every(Number.isFinite))
      throw new StlError(`A vertex is not three numbers: "${m[0]}".`);
    out.push(...xyz);
    if (out.length > MAX_STL_TRIANGLES * 9)
      throw new StlError(`Meshes over ${MAX_STL_TRIANGLES} triangles are not measured.`);
  }
  if (out.length % 9 !== 0)
    throw new StlError("The vertex count is not a multiple of three: a facet is cut short.");
  return { coords: Float64Array.from(out), triangles: out.length / 9, kind: "ascii", name };
}

/** Reads the mesh from raw bytes (binary or ASCII) or from text (ASCII). Throws StlError when unreadable. */
export function readStl(input: Uint8Array | string): Mesh {
  if (typeof input !== "string" && isBinaryStl(input)) return readBinary(input);
  const text = typeof input === "string" ? input : new TextDecoder("latin1").decode(input);
  if (!looksLikeAsciiStl(text))
    throw new StlError(
      "Not an STL this can read: neither a binary STL (its size does not match its triangle count) nor an ASCII one.",
    );
  return readAscii(text);
}

interface Topology {
  /** welded corner positions in file units: x, y, z per vertex id */
  verts: number[];
  /** triangle corners as welded vertex ids, 3 per kept triangle */
  tri: Uint32Array;
  /** triangles dropped because two corners are the same point */
  degenerate: number;
  /** directed edges with no triangle running them the other way: a gap or a T-junction */
  openEdges: number;
  /** directed edges run the same way by two or more triangles: neighbours facing opposite ways */
  flippedEdges: number;
  /** connected pieces (triangles joined through shared edges) */
  components: number[][];
}

function topology(mesh: Mesh): Topology {
  const ids = new Map<string, number>();
  const verts: number[] = [];
  const corner = (t: number, c: number): number => {
    const o = t * 9 + c * 3;
    const x = mesh.coords[o] as number;
    const y = mesh.coords[o + 1] as number;
    const z = mesh.coords[o + 2] as number;
    const key = `${x},${y},${z}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
      verts.push(x, y, z);
    }
    return id;
  };
  const kept: number[] = [];
  let degenerate = 0;
  for (let t = 0; t < mesh.triangles; t++) {
    const a = corner(t, 0);
    const b = corner(t, 1);
    const c = corner(t, 2);
    if (a === b || b === c || a === c) {
      degenerate++;
      continue;
    }
    kept.push(a, b, c);
  }
  const n = kept.length / 3;
  const tri = Uint32Array.from(kept);
  // directed edge "a>b" -> triangles using it
  const directed = new Map<string, number[]>();
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) {
      const a = tri[i * 3 + k] as number;
      const b = tri[i * 3 + ((k + 1) % 3)] as number;
      const key = `${a}>${b}`;
      const list = directed.get(key);
      if (list) list.push(i);
      else directed.set(key, [i]);
    }
  // union-find over triangles sharing an edge (either direction)
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x] as number] as number;
      x = parent[x] as number;
    }
    return x;
  };
  let openEdges = 0;
  let flippedEdges = 0;
  for (const [key, uses] of directed) {
    const [a, b] = key.split(">");
    const back = directed.get(`${b}>${a}`);
    // Closed and consistently facing: each edge run once each way. Used twice the same way: two
    // neighbours face opposite ways (or three or more triangles meet there). No reverse: a gap.
    if (uses.length > 1) flippedEdges++;
    else if (!back) openEdges++;
    const root = uses[0] as number;
    for (const t of [...uses, ...(back ?? [])]) {
      const ra = find(root);
      const rb = find(t);
      if (ra !== rb) parent[ra] = rb;
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  }
  return { verts, tri, degenerate, openEdges, flippedEdges, components: [...groups.values()] };
}

/** Extract features from an STL. Lengths come out in mm: the file has no units, so `assumeUnits` (default mm) applies. */
export function extractStl(input: Uint8Array | string, opts: ExtractOptions = {}): PartFeatures {
  const mesh = readStl(input);
  const flags: Flag[] = [];
  const assumed: LengthUnit = opts.assumeUnits ?? "mm";
  const k = MM_PER[assumed];
  flags.push({
    code: "units-unknown",
    message: `An STL file has no units; read as ${assumed}. Check the size against the drawing.`,
  });
  if (!mesh.triangles) {
    flags.push({ code: "no-solid", message: "The STL file has no triangles." });
    return result(mesh, assumed, null, [], null, flags, "low", "low");
  }
  for (let i = 0; i < mesh.coords.length; i++)
    if (!Number.isFinite(mesh.coords[i] as number))
      throw new StlError("A vertex is not a finite number.");

  const topo = topology(mesh);
  const P = (v: number): [number, number, number] => [
    (topo.verts[v * 3] as number) * k,
    (topo.verts[v * 3 + 1] as number) * k,
    (topo.verts[v * 3 + 2] as number) * k,
  ];

  const closed = topo.openEdges === 0 && topo.flippedEdges === 0;
  const bodies: SolidBody[] = [];
  let area = 0;
  for (const [index, comp] of topo.components.entries()) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const i of comp)
      for (let c = 0; c < 3; c++) {
        const v = P(topo.tri[i * 3 + c] as number);
        for (let d = 0; d < 3; d++) {
          lo[d] = Math.min(lo[d] as number, v[d] as number);
          hi[d] = Math.max(hi[d] as number, v[d] as number);
        }
      }
    // Tetrahedra from the body's low corner (not the origin: a part far from the origin keeps its
    // precision) to each triangle: (p · (q × r)) / 6 with p, q, r relative to that corner.
    let vol = 0;
    let a = 0;
    for (const i of comp) {
      const [px, py, pz] = rel(P(topo.tri[i * 3] as number), lo);
      const [qx, qy, qz] = rel(P(topo.tri[i * 3 + 1] as number), lo);
      const [rx, ry, rz] = rel(P(topo.tri[i * 3 + 2] as number), lo);
      vol += (px * (qy * rz - qz * ry) - py * (qx * rz - qz * rx) + pz * (qx * ry - qy * rx)) / 6;
      const ux = qx - px;
      const uy = qy - py;
      const uz = qz - pz;
      const vx = rx - px;
      const vy = ry - py;
      const vz = rz - pz;
      a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    area += a;
    const box = toBox(lo, hi);
    const boxVol = box.size.x * box.size.y * box.size.z;
    let volume: number | null = null;
    let volumeNote: string | undefined;
    if (!closed) volumeNote = "open mesh: no volume";
    else if (vol < 0) {
      volumeNote = "triangles face inward (negative volume)";
    } else if (!(vol > 0) || vol > boxVol * (1 + 1e-6)) {
      volumeNote = `mesh volume ${vol.toExponential(3)} mm³ failed the bounding-box check`;
    } else volume = Math.round(vol * 1000) / 1000;
    const body: SolidBody = {
      name: topo.components.length > 1 ? `${mesh.name || "mesh"} ${index + 1}` : mesh.name,
      faceCount: comp.length,
      boundingBox: box,
      volume,
      surfaceTypes: { TRIANGLE: comp.length },
      cylinders: [],
      holeAxes: [],
      partialCylinderFaces: 0,
    };
    if (volumeNote) body.volumeNote = volumeNote;
    bodies.push(body);
  }

  if (topo.degenerate)
    flags.push({
      code: "parse-errors",
      message: `${topo.degenerate} triangles with two corners at the same point were skipped.`,
    });
  if (!closed) {
    const why = [
      topo.openEdges
        ? `${topo.openEdges} edges with no matching neighbour (a gap or a T-junction)`
        : "",
      topo.flippedEdges
        ? `${topo.flippedEdges} edges where neighbouring triangles face opposite ways`
        : "",
    ]
      .filter(Boolean)
      .join("; ");
    flags.push({
      code: "surface-model",
      message: `The mesh is not closed (${why}), so it has no volume. Ask for a STEP file, or repair the mesh and send it again.`,
    });
  } else if (bodies.some((b) => b.volume === null)) {
    flags.push({
      code: "volume-failed-check",
      message: `Volume not computed: ${[...new Set(bodies.filter((b) => b.volume === null).map((b) => b.volumeNote))].join("; ")}.`,
    });
  }
  if (bodies.length > 1)
    flags.push({
      code: "multiple-solids",
      message: `${bodies.length} separate pieces in one mesh; the box covers all of them.`,
    });
  flags.push({
    code: "approximated-curves",
    message:
      "An STL is flat triangles: a curved face is cut into facets, so the volume can be slightly under the real part's, and holes are not found.",
  });

  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const b of bodies) {
    if (!b.boundingBox) continue;
    const { min, max } = b.boundingBox;
    lo[0] = Math.min(lo[0] as number, min.x);
    lo[1] = Math.min(lo[1] as number, min.y);
    lo[2] = Math.min(lo[2] as number, min.z);
    hi[0] = Math.max(hi[0] as number, max.x);
    hi[1] = Math.max(hi[1] as number, max.y);
    hi[2] = Math.max(hi[2] as number, max.z);
  }
  const vols = bodies.map((b) => b.volume);
  const totalVolume =
    vols.length && vols.every((v) => v !== null)
      ? Math.round((vols as number[]).reduce((s, v) => s + v, 0) * 1000) / 1000
      : null;
  const measures: Confidence = totalVolume === null ? "low" : "medium";
  const boxConf: Confidence = topo.degenerate ? "low" : "medium";
  return result(
    mesh,
    assumed,
    bodies.length ? toBox(lo, hi) : null,
    bodies,
    totalVolume,
    flags,
    boxConf,
    measures,
    Math.round(area * 1000) / 1000,
  );
}

const rel = (v: [number, number, number], o: number[]): [number, number, number] => [
  v[0] - (o[0] as number),
  v[1] - (o[1] as number),
  v[2] - (o[2] as number),
];

function toBox(lo: number[], hi: number[]): BoundingBox {
  const r = (v: number): number => Math.round(v * 1e4) / 1e4;
  const min = { x: r(lo[0] as number), y: r(lo[1] as number), z: r(lo[2] as number) };
  const max = { x: r(hi[0] as number), y: r(hi[1] as number), z: r(hi[2] as number) };
  return { min, max, size: { x: r(max.x - min.x), y: r(max.y - min.y), z: r(max.z - min.z) } };
}

function result(
  mesh: Mesh,
  assumed: LengthUnit,
  box: BoundingBox | null,
  bodies: SolidBody[],
  totalVolume: number | null,
  flags: Flag[],
  boundingBox: Confidence,
  measures: Confidence,
  surfaceArea: number | null = null,
): PartFeatures {
  return {
    format: "stl",
    units: "mm",
    sourceUnits: assumed,
    unitsAssumed: true,
    boundingBox: box,
    flat: null,
    solid: {
      schema: mesh.kind === "binary" ? "STL (binary)" : "STL (ASCII)",
      bodies,
      totalVolume,
      assemblyUsages: 0,
    },
    mesh: { triangles: mesh.triangles, surfaceArea },
    confidence: "low",
    fieldConfidence: { units: "low", boundingBox, measures, holes: "low", bends: "low" },
    flags,
    unsupported: {},
  };
}
