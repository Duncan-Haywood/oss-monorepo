// Minimal ASCII DXF writer for authored test fixtures (R2000-style group codes, no handles).

export interface DxfOpts {
  /** $INSUNITS; omit to leave the header out */
  insunits?: number;
  /** layer name → linetype */
  layers?: Record<string, string>;
  blocks?: { name: string; base?: [number, number]; entities: string[] }[];
}

export const pairs = (...kv: (string | number)[]): string => {
  const out: string[] = [];
  for (let i = 0; i < kv.length; i += 2) out.push(String(kv[i]), String(kv[i + 1]));
  return out.join("\n");
};

export function dxf(entities: string[], opts: DxfOpts = {}): string {
  const parts: string[] = [];
  if (opts.insunits !== undefined) {
    parts.push(pairs(0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, opts.insunits, 0, "ENDSEC"));
  }
  if (opts.layers) {
    const recs = Object.entries(opts.layers).map(([n, lt]) =>
      pairs(0, "LAYER", 2, n, 70, 0, 6, lt),
    );
    parts.push(
      pairs(0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LAYER"),
      ...recs,
      pairs(0, "ENDTAB", 0, "ENDSEC"),
    );
  }
  if (opts.blocks) {
    parts.push(pairs(0, "SECTION", 2, "BLOCKS"));
    for (const b of opts.blocks) {
      const [bx, by] = b.base ?? [0, 0];
      parts.push(
        pairs(0, "BLOCK", 8, "0", 2, b.name, 70, 0, 10, bx, 20, by, 30, 0),
        ...b.entities,
        pairs(0, "ENDBLK"),
      );
    }
    parts.push(pairs(0, "ENDSEC"));
  }
  parts.push(pairs(0, "SECTION", 2, "ENTITIES"), ...entities, pairs(0, "ENDSEC", 0, "EOF"));
  return `${parts.join("\n")}\n`;
}

export const line = (
  layer: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  linetype?: string,
): string =>
  pairs(
    0,
    "LINE",
    8,
    layer,
    ...(linetype ? [6, linetype] : []),
    10,
    x1,
    20,
    y1,
    30,
    0,
    11,
    x2,
    21,
    y2,
    31,
    0,
  );

export const circle = (layer: string, x: number, y: number, r: number, extrusionZ = 1): string =>
  pairs(0, "CIRCLE", 8, layer, 10, x, 20, y, 30, 0, 40, r, 210, 0, 220, 0, 230, extrusionZ);

export const arc = (
  layer: string,
  x: number,
  y: number,
  r: number,
  a0: number,
  a1: number,
): string => pairs(0, "ARC", 8, layer, 10, x, 20, y, 30, 0, 40, r, 50, a0, 51, a1);

/** vertices as [x, y] or [x, y, bulge] */
export const lwpolyline = (layer: string, pts: number[][], closed: boolean): string =>
  [
    pairs(0, "LWPOLYLINE", 8, layer, 90, pts.length, 70, closed ? 1 : 0),
    ...pts.map((p) => pairs(10, p[0] ?? 0, 20, p[1] ?? 0, ...(p[2] ? [42, p[2]] : []))),
  ].join("\n");

export const insert = (
  block: string,
  x: number,
  y: number,
  o: { sx?: number; sy?: number; rot?: number; layer?: string; extrusionZ?: number } = {},
): string =>
  pairs(
    0,
    "INSERT",
    8,
    o.layer ?? "0",
    2,
    block,
    10,
    x,
    20,
    y,
    30,
    0,
    41,
    o.sx ?? 1,
    42,
    o.sy ?? 1,
    50,
    o.rot ?? 0,
    230,
    o.extrusionZ ?? 1,
  );

/** Spline from explicit degree, knots, control points and optional weights. */
export const spline = (
  layer: string,
  degree: number,
  knots: number[],
  ctrl: [number, number][],
  weights?: number[],
  closed = false,
): string =>
  [
    pairs(
      0,
      "SPLINE",
      8,
      layer,
      70,
      (closed ? 1 : 0) | (weights ? 4 : 0),
      71,
      degree,
      72,
      knots.length,
      73,
      ctrl.length,
      74,
      0,
    ),
    ...knots.map((k) => pairs(40, k)),
    ...(weights ?? []).map((w) => pairs(41, w)),
    ...ctrl.map(([x, y]) => pairs(10, x, 20, y, 30, 0)),
  ].join("\n");

export const text = (layer: string, s: string): string =>
  pairs(0, "TEXT", 8, layer, 10, 0, 20, 0, 40, 2.5, 1, s);

export const face3d = (layer: string): string =>
  pairs(
    0,
    "3DFACE",
    8,
    layer,
    10,
    0,
    20,
    0,
    30,
    0,
    11,
    1,
    21,
    0,
    31,
    0,
    12,
    1,
    22,
    1,
    32,
    0,
    13,
    0,
    23,
    1,
    33,
    0,
  );
