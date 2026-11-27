// Writes small fixed-format IGES files for tests: Start, Global, Directory Entry, Parameter Data
// and Terminate sections, 80 columns each, from a list of entities added in order.

export type Param = number | string | null;

export interface EntityOpts {
  form?: number;
  /** DE pointer of a 124 transformation matrix */
  transform?: number;
  /** status digits: blank (0/1), subordinate (0-3), use (0-6) */
  blank?: number;
  subordinate?: number;
  use?: number;
  label?: string;
}

interface Ent {
  type: number;
  params: Param[];
  opts: EntityOpts;
}

export interface GlobalOpts {
  unitFlag?: number;
  unitName?: string;
  modelScale?: number;
  fileName?: string;
  /** write ",," for the two delimiter parameters (both defaulted) */
  defaultDelimiters?: boolean;
  /** write reals with a D exponent (1.0D1) */
  dExponent?: boolean;
}

const holl = (s: string) => `${s.length}H${s}`;

export class IgesWriter {
  private ents: Ent[] = [];
  private g: GlobalOpts;
  constructor(g: GlobalOpts = {}) {
    this.g = g;
  }

  /** Adds an entity and returns its DE pointer (1, 3, 5, ...). */
  add(type: number, params: Param[], opts: EntityOpts = {}): number {
    this.ents.push({ type, params, opts });
    return this.ents.length * 2 - 1;
  }

  line(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, o?: EntityOpts) {
    return this.add(110, [x1, y1, z1, x2, y2, z2], o);
  }

  /** 124: rotation rows R and translation t, applied as R·p + t */
  matrix(R: number[][], t: [number, number, number]): number {
    const r = R.map((row) => row.map((v) => v));
    return this.add(124, [
      r[0]?.[0] ?? 1,
      r[0]?.[1] ?? 0,
      r[0]?.[2] ?? 0,
      t[0],
      r[1]?.[0] ?? 0,
      r[1]?.[1] ?? 1,
      r[1]?.[2] ?? 0,
      t[1],
      r[2]?.[0] ?? 0,
      r[2]?.[1] ?? 0,
      r[2]?.[2] ?? 1,
      t[2],
    ]);
  }

  /** 126 NURBS curve: degree p, knots, control points, optional weights (rational when given) */
  nurbsCurve(p: number, knots: number[], pts: number[][], weights?: number[], o?: EntityOpts) {
    const K = pts.length - 1;
    const w = weights ?? pts.map(() => 1);
    return this.add(
      126,
      [
        K,
        p,
        0,
        0,
        weights ? 0 : 1,
        0,
        ...knots,
        ...w,
        ...pts.flat(),
        knots[p] ?? 0,
        knots[K + 1] ?? 1,
      ],
      o,
    );
  }

  /** 128 NURBS surface; pts indexed [v][u] (u varies fastest in the file) */
  nurbsSurface(
    p: number,
    q: number,
    uk: number[],
    vk: number[],
    pts: number[][][],
    weights?: number[][],
    o?: EntityOpts,
  ) {
    const K1 = (pts[0]?.length ?? 1) - 1;
    const K2 = pts.length - 1;
    const w = weights ? weights.flat() : pts.flat().map(() => 1);
    return this.add(
      128,
      [
        K1,
        K2,
        p,
        q,
        0,
        0,
        weights ? 0 : 1,
        0,
        0,
        ...uk,
        ...vk,
        ...w,
        ...pts.flat().flat(),
        uk[p] ?? 0,
        uk[K1 + 1] ?? 1,
        vk[q] ?? 0,
        vk[K2 + 1] ?? 1,
      ],
      o,
    );
  }

  /** a closed polyline as a 102 composite of 110 lines; returns the composite's DE */
  polyline(points: number[][], o?: EntityOpts): number {
    const ids: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i] as number[];
      const b = points[(i + 1) % points.length] as number[];
      ids.push(
        this.line(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, {
          subordinate: 1,
          ...(o ?? {}),
        }),
      );
    }
    return this.add(102, [ids.length, ...ids], { subordinate: 1, ...(o ?? {}) });
  }

  toString(eol = "\n"): string {
    const fmt = (v: Param): string => {
      if (v === null) return "";
      if (typeof v === "string") return holl(v);
      if (Number.isInteger(v) && Math.abs(v) < 1e9) return String(v);
      const s = v.toExponential(12).replace("e", this.g.dExponent ? "D" : "E");
      return s;
    };
    const rec = (body: string, sec: string, n: number) =>
      `${body.padEnd(72)}${sec}${String(n).padStart(7)}`;
    const wrap = (text: string, width: number): string[] => {
      const out: string[] = [];
      for (let i = 0; i < text.length; i += width) out.push(text.slice(i, i + width));
      return out.length ? out : [""];
    };
    const S = [rec("cad-features test file", "S", 1)];
    const gp: Param[] = [
      this.g.fileName ?? "part.igs",
      "cad-features",
      "1.0",
      32,
      38,
      6,
      308,
      15,
      "part",
      this.g.modelScale ?? 1.0,
      this.g.unitFlag ?? 2,
      this.g.unitName ?? "MM",
      1,
      0.0,
      "20261126.120000",
      1e-6,
      1000.0,
      "test",
      "test",
      11,
      0,
      "20261126.120000",
    ];
    const head = this.g.defaultDelimiters ? ",," : "1H,,1H;,";
    const gText = `${head}${holl("cad-features")},${gp.map(fmt).join(",")};`;
    const G = wrap(gText, 72).map((t, i) => rec(t, "G", i + 1));
    const D: string[] = [];
    const P: string[] = [];
    this.ents.forEach((e, i) => {
      const de = i * 2 + 1;
      const body = wrap(`${[e.type, ...e.params].map(fmt).join(",")};`, 64);
      const start = P.length + 1;
      for (const chunk of body)
        P.push(`${chunk.padEnd(64)} ${String(de).padStart(7)}P${String(P.length + 1).padStart(7)}`);
      const f8 = (v: number | string) => String(v).padStart(8);
      const o = e.opts;
      const status = `${String(o.blank ?? 0).padStart(2, "0")}${String(o.subordinate ?? 0).padStart(2, "0")}${String(o.use ?? 0).padStart(2, "0")}00`;
      D.push(
        rec([e.type, start, 0, 0, 0, 0, o.transform ?? 0, 0].map(f8).join("") + status, "D", de),
      );
      D.push(
        rec(
          [e.type, 0, 0, body.length, o.form ?? 0, "", "", (o.label ?? "").padStart(8), 0]
            .map(f8)
            .join(""),
          "D",
          de + 1,
        ),
      );
    });
    const T = rec(
      `S${String(S.length).padStart(7)}G${String(G.length).padStart(7)}D${String(D.length).padStart(7)}P${String(P.length).padStart(7)}`,
      "T",
      1,
    );
    return [...S, ...G, ...D, ...P, T].join(eol) + eol;
  }
}
