// Minimal STEP (ISO 10303-21) B-rep writer for authored test fixtures: rectangular plates with
// optional through holes along Z or X and countersinks, plus a plain cylinder. Faces carry the
// correct same_sense (outward normal); edges are not shared between faces, which the reader
// does not need.

type V = [number, number, number];

const f = (n: number): string => (Number.isInteger(n) ? `${n}.` : String(n));
const vec = (v: V): string => `(${v.map(f).join(",")})`;

export type LengthUnitName = "mm" | "m" | "in";

export class StepWriter {
  private rows: string[] = [];
  private n = 0;

  add(body: string): string {
    this.n++;
    const id = `#${this.n}`;
    this.rows.push(`${id}=${body};`);
    return id;
  }

  pt(p: V): string {
    return this.add(`CARTESIAN_POINT('',${vec(p)})`);
  }
  dir(d: V): string {
    return this.add(`DIRECTION('',${vec(d)})`);
  }
  axis(o: V, z: V, x: V): string {
    return this.add(`AXIS2_PLACEMENT_3D('',${this.pt(o)},${this.dir(z)},${this.dir(x)})`);
  }
  vertex(p: V): string {
    return this.add(`VERTEX_POINT('',${this.pt(p)})`);
  }
  lineEdge(a: V, b: V): string {
    const d: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...d);
    const v = this.add(`VECTOR('',${this.dir(d)},${f(len)})`);
    const ln = this.add(`LINE('',${this.pt(a)},${v})`);
    return this.add(`EDGE_CURVE('',${this.vertex(a)},${this.vertex(b)},${ln},.T.)`);
  }
  /** full circle; its single vertex sits at centre + r·x */
  circleEdge(c: V, z: V, x: V, r: number): string {
    const v = this.vertex([c[0] + r * x[0], c[1] + r * x[1], c[2] + r * x[2]]);
    const circ = this.add(`CIRCLE('',${this.axis(c, z, x)},${f(r)})`);
    return this.add(`EDGE_CURVE('',${v},${v},${circ},.T.)`);
  }
  loop(edges: [string, boolean][]): string {
    const oes = edges.map(([e, fwd]) =>
      this.add(`ORIENTED_EDGE('',*,*,${e},${fwd ? ".T." : ".F."})`),
    );
    return this.add(`EDGE_LOOP('',(${oes.join(",")}))`);
  }
  face(outer: string, inner: string[], surface: string, sameSense: boolean): string {
    const b = [
      this.add(`FACE_OUTER_BOUND('',${outer},.T.)`),
      ...inner.map((l) => this.add(`FACE_BOUND('',${l},.T.)`)),
    ];
    return this.add(`ADVANCED_FACE('',(${b.join(",")}),${surface},${sameSense ? ".T." : ".F."})`);
  }
  plane(o: V, z: V, x: V): string {
    return this.add(`PLANE('',${this.axis(o, z, x)})`);
  }
  cylinder(o: V, z: V, x: V, r: number): string {
    return this.add(`CYLINDRICAL_SURFACE('',${this.axis(o, z, x)},${f(r)})`);
  }
  cone(o: V, z: V, x: V, r: number, semiAngle: number): string {
    return this.add(`CONICAL_SURFACE('',${this.axis(o, z, x)},${f(r)},${f(semiAngle)})`);
  }
  solid(name: string, faces: string[]): string {
    const shell = this.add(`CLOSED_SHELL('',(${faces.join(",")}))`);
    return this.add(`MANIFOLD_SOLID_BREP('${name}',${shell})`);
  }

  file(solids: string[], unit: LengthUnitName = "mm", angle: "rad" | "deg" = "rad"): string {
    let len: string;
    if (unit === "in") {
      const mm = this.add("( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )");
      const m = this.add(`LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),${mm})`);
      const de = this.add("DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.)");
      len = this.add(`( CONVERSION_BASED_UNIT('INCH',${m}) LENGTH_UNIT() NAMED_UNIT(${de}) )`);
    } else {
      len = this.add(
        `( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(${unit === "mm" ? ".MILLI." : "$"},.METRE.) )`,
      );
    }
    let ang = this.add("( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )");
    if (angle === "deg") {
      const m = this.add(
        `PLANE_ANGLE_MEASURE_WITH_UNIT(PLANE_ANGLE_MEASURE(0.0174532925199433),${ang})`,
      );
      const de = this.add("DIMENSIONAL_EXPONENTS(0.,0.,0.,0.,0.,0.,0.)");
      ang = this.add(
        `( CONVERSION_BASED_UNIT('DEGREE',${m}) NAMED_UNIT(${de}) PLANE_ANGLE_UNIT() )`,
      );
    }
    const sr = this.add("( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )");
    const ctx = this.add(
      `( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNIT_ASSIGNED_CONTEXT((${len},${ang},${sr})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )`,
    );
    this.add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${solids.join(",")}),${ctx})`);
    return [
      "ISO-10303-21;",
      "HEADER;",
      "FILE_DESCRIPTION(('authored test fixture'),'2;1');",
      "FILE_NAME('fixture.step','2026-11-24T00:00:00',(''),(''),'','','');",
      "FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));",
      "ENDSEC;",
      "DATA;",
      ...this.rows,
      "ENDSEC;",
      "END-ISO-10303-21;",
      "",
    ].join("\n");
  }
}

export interface PlateSpec {
  w: number;
  h: number;
  t: number;
  /** through holes along Z at (x, y), optional countersink to radius R over depth d at the top */
  zHoles?: {
    x: number;
    y: number;
    r: number;
    countersink?: { R: number; depth: number };
    /** a flat-bottomed counterbore of radius R, `depth` deep from the top */
    counterbore?: { R: number; depth: number };
  }[];
  /** through holes along X at (y, z) */
  xHoles?: { y: number; z: number; r: number }[];
}

const X: V = [1, 0, 0];
const Y: V = [0, 1, 0];
const Z: V = [0, 0, 1];

function rect(sw: StepWriter, a: V, b: V, c: V, d: V): string {
  return sw.loop([
    [sw.lineEdge(a, b), true],
    [sw.lineEdge(b, c), true],
    [sw.lineEdge(c, d), true],
    [sw.lineEdge(d, a), true],
  ]);
}

/** A W×H×T plate at the origin with through holes; returns the solid id. */
export function plate(sw: StepWriter, s: PlateSpec, name = "plate"): string {
  const { w, h, t } = s;
  const zh = s.zHoles ?? [];
  const xh = s.xHoles ?? [];
  const faces: string[] = [];
  const zCircle = (x: number, y: number, z: number, r: number): string =>
    sw.loop([[sw.circleEdge([x, y, z], Z, X, r), true]]);
  const xCircle = (x: number, y: number, z: number, r: number): string =>
    sw.loop([[sw.circleEdge([x, y, z], X, Y, r), true]]);

  // bottom z=0 (outward -Z) and top z=t (outward +Z)
  faces.push(
    sw.face(
      rect(sw, [0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0]),
      zh.map((o) => zCircle(o.x, o.y, 0, o.r)),
      sw.plane([0, 0, 0], Z, X),
      false,
    ),
    sw.face(
      rect(sw, [0, 0, t], [w, 0, t], [w, h, t], [0, h, t]),
      zh.map((o) => zCircle(o.x, o.y, t, o.countersink?.R ?? o.counterbore?.R ?? o.r)),
      sw.plane([0, 0, t], Z, X),
      true,
    ),
  );
  // y=0 and y=h
  faces.push(
    sw.face(
      rect(sw, [0, 0, 0], [w, 0, 0], [w, 0, t], [0, 0, t]),
      [],
      sw.plane([0, 0, 0], Y, X),
      false,
    ),
    sw.face(
      rect(sw, [0, h, 0], [w, h, 0], [w, h, t], [0, h, t]),
      [],
      sw.plane([0, h, 0], Y, X),
      true,
    ),
  );
  // x=0 and x=w, with the X holes
  faces.push(
    sw.face(
      rect(sw, [0, 0, 0], [0, h, 0], [0, h, t], [0, 0, t]),
      xh.map((o) => xCircle(0, o.y, o.z, o.r)),
      sw.plane([0, 0, 0], X, Y),
      false,
    ),
    sw.face(
      rect(sw, [w, 0, 0], [w, h, 0], [w, h, t], [w, 0, t]),
      xh.map((o) => xCircle(w, o.y, o.z, o.r)),
      sw.plane([w, 0, 0], X, Y),
      true,
    ),
  );
  // hole walls: material is outside the cylinder, so the outward normal points at the axis
  for (const o of zh) {
    const top = o.countersink
      ? t - o.countersink.depth
      : o.counterbore
        ? t - o.counterbore.depth
        : t;
    faces.push(
      sw.face(
        sw.loop([[sw.circleEdge([o.x, o.y, 0], Z, X, o.r), true]]),
        [sw.loop([[sw.circleEdge([o.x, o.y, top], Z, X, o.r), false]])],
        sw.cylinder([o.x, o.y, 0], Z, X, o.r),
        false,
      ),
    );
    if (o.countersink) {
      const { R, depth } = o.countersink;
      faces.push(
        sw.face(
          sw.loop([[sw.circleEdge([o.x, o.y, top], Z, X, o.r), true]]),
          [sw.loop([[sw.circleEdge([o.x, o.y, t], Z, X, R), false]])],
          sw.cone([o.x, o.y, top], Z, X, o.r, Math.atan((R - o.r) / depth)),
          false,
        ),
      );
    }
    if (o.counterbore) {
      const { R } = o.counterbore;
      // the counterbore's flat floor (material below, outward +Z) and its wall
      faces.push(
        sw.face(
          zCircle(o.x, o.y, top, R),
          [zCircle(o.x, o.y, top, o.r)],
          sw.plane([o.x, o.y, top], Z, X),
          true,
        ),
        sw.face(
          sw.loop([[sw.circleEdge([o.x, o.y, top], Z, X, R), true]]),
          [sw.loop([[sw.circleEdge([o.x, o.y, t], Z, X, R), false]])],
          sw.cylinder([o.x, o.y, top], Z, X, R),
          false,
        ),
      );
    }
  }
  for (const o of xh) {
    faces.push(
      sw.face(
        sw.loop([[sw.circleEdge([0, o.y, o.z], X, Y, o.r), true]]),
        [sw.loop([[sw.circleEdge([w, o.y, o.z], X, Y, o.r), false]])],
        sw.cylinder([0, o.y, o.z], X, Y, o.r),
        false,
      ),
    );
  }
  return sw.solid(name, faces);
}

/** Solid cylinder of radius r and height h standing on the origin. */
export function rod(sw: StepWriter, r: number, h: number, name = "rod"): string {
  const bottom = sw.face(
    sw.loop([[sw.circleEdge([0, 0, 0], Z, X, r), true]]),
    [],
    sw.plane([0, 0, 0], Z, X),
    false,
  );
  const top = sw.face(
    sw.loop([[sw.circleEdge([0, 0, h], Z, X, r), true]]),
    [],
    sw.plane([0, 0, h], Z, X),
    true,
  );
  const side = sw.face(
    sw.loop([[sw.circleEdge([0, 0, 0], Z, X, r), true]]),
    [sw.loop([[sw.circleEdge([0, 0, h], Z, X, r), false]])],
    sw.cylinder([0, 0, 0], Z, X, r),
    true,
  );
  return sw.solid(name, [bottom, top, side]);
}
