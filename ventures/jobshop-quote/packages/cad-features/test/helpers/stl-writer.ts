// Writes small STL meshes for tests: binary and ASCII, from triangles given as three [x, y, z] corners.

export type P3 = [number, number, number];
export type Tri = [P3, P3, P3];

/** A box from (x0, y0, z0) to (x1, y1, z1), 12 triangles, counter-clockwise seen from outside. */
export function boxMesh(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): Tri[] {
  const c = (i: number): P3 => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  // each face as 4 corner indices, counter-clockwise from outside
  const faces: [number, number, number, number][] = [
    [0, 2, 3, 1], // z0, normal -z
    [4, 5, 7, 6], // z1, +z
    [0, 1, 5, 4], // y0, -y
    [2, 6, 7, 3], // y1, +y
    [0, 4, 6, 2], // x0, -x
    [1, 3, 7, 5], // x1, +x
  ];
  return faces.flatMap(([a, b, cc, d]) => [[c(a), c(b), c(cc)] as Tri, [c(a), c(cc), c(d)] as Tri]);
}

/** A closed n-sided prism around the z axis (a faceted cylinder of radius r, height h). */
export function prismMesh(n: number, r: number, h: number): Tri[] {
  const ring = (z: number): P3[] =>
    Array.from({ length: n }, (_, i) => [
      r * Math.cos((2 * Math.PI * i) / n),
      r * Math.sin((2 * Math.PI * i) / n),
      z,
    ]);
  const lo = ring(0);
  const hi = ring(h);
  const out: Tri[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push([lo[i] as P3, lo[j] as P3, hi[j] as P3], [lo[i] as P3, hi[j] as P3, hi[i] as P3]);
    out.push([[0, 0, 0], lo[j] as P3, lo[i] as P3]); // bottom, facing -z
    out.push([[0, 0, h], hi[i] as P3, hi[j] as P3]); // top, facing +z
  }
  return out;
}

export function binaryStl(tris: Tri[], header = "test mesh"): Uint8Array {
  const buf = new ArrayBuffer(84 + 50 * tris.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < Math.min(80, header.length); i++) bytes[i] = header.charCodeAt(i);
  const dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, i) => {
    const o = 84 + 50 * i + 12; // normal left at 0: readers recompute it
    for (const [k, p] of t.entries())
      for (const [d, v] of p.entries()) dv.setFloat32(o + 12 * k + 4 * d, v, true);
  });
  return bytes;
}

export function asciiStl(tris: Tri[], name = "part"): string {
  const lines = [`solid ${name}`];
  for (const t of tris) {
    lines.push("  facet normal 0 0 0", "    outer loop");
    for (const p of t) lines.push(`      vertex ${p.map((v) => v.toExponential(6)).join(" ")}`);
    lines.push("    endloop", "  endfacet");
  }
  lines.push(`endsolid ${name}`);
  return `${lines.join("\n")}\n`;
}
