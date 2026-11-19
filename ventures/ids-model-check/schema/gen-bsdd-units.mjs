// Builds schema/bsdd-units.json: bSDD's unit codes with the QUDT facts an IDS
// generator needs to pick an IFC measure type and write a value in SI units.
//   node schema/gen-bsdd-units.mjs BSDD_UNITS.json QUDT_UNIT.ttl > schema/bsdd-units.json
// BSDD_UNITS.json: GET https://api.bsdd.buildingsmart.org/api/Unit/v1 (each
//   unit's code, name and qudtUri).
// QUDT_UNIT.ttl: GET https://qudt.org/vocab/unit/ with Accept: text/turtle
//   (QUDT, CC BY 4.0, qudt.org). Per unit it gives conversionMultiplier and
//   conversionOffset to the SI unit, the dimension vector and quantity kinds.
// Output: { source, units: { QUDT_NAME: { m, o?, dim: [L,M,T,I,Θ,N,J], kinds } },
//   codes: { bSDD code: QUDT_NAME } }. A QUDT dimensionless vector (D1) is all
//   zeros; plane angle (rad) is dimensionless too, and its kind tells it apart.
import { readFileSync } from "node:fs";

const [bsddFile, ttlFile] = process.argv.slice(2);
const bsdd = JSON.parse(readFileSync(bsddFile, "utf8"));
const ttl = readFileSync(ttlFile, "utf8");

// One block per subject "unit:NAME" up to the line that ends it with " .".
const units = {};
const re = /^unit:(\S+)\n([\s\S]*?\s\.)\n/gm;
let m;
while ((m = re.exec(ttl))) {
  const [, name, body] = m;
  const num = (k) => { const x = new RegExp(`qudt:${k} (-?[\\d.]+(?:E-?\\d+)?)`).exec(body); return x ? Number(x[1]) : null; };
  const dv = /qudt:hasDimensionVector qkdv:(A-?\d+E-?\d+L-?\d+I-?\d+M-?\d+H-?\d+T-?\d+D\d)/.exec(body);
  if (!dv) continue;
  const e = Object.fromEntries([...dv[1].matchAll(/([AELIMHTD])(-?\d+)/g)].map((x) => [x[1], Number(x[2])]));
  const kinds = [...body.matchAll(/qudt:hasQuantityKind quantitykind:(\S+?)\s*[;.]/g)].map((x) => x[1]);
  units[name] = { m: num("conversionMultiplier"), o: num("conversionOffset"), dim: [e.L, e.M, e.T, e.E, e.H, e.A, e.I], kinds };
}

// Links in bSDD's unit list that QUDT reads as another unit. bSDD names "°"
// "grad (angel degree)" (German Grad = degree) and links it to QUDT GRAD, the
// gon (pi/200 rad); the symbol is the degree's, so it is read as DEG.
const RELINK = { "°": "DEG" };

const out = { source: "bSDD /api/Unit/v1 and QUDT units (qudt.org, CC BY 4.0) via schema/gen-bsdd-units.mjs", relinked: RELINK, units: {}, codes: {} };
for (const u of bsdd) {
  const name = Object.hasOwn(RELINK, u.code) ? [null, RELINK[u.code]] : u.qudtUri && /\/vocab\/unit\/([^/#]+)$/.exec(u.qudtUri);
  if (!name || !units[name[1]]) continue;
  const q = units[name[1]];
  const r = { m: q.m, dim: q.dim, kinds: q.kinds };
  if (q.o) r.o = q.o;
  out.units[name[1]] = r;
  out.codes[u.code] = name[1];
}
const keys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
out.units = keys(out.units);
out.codes = keys(out.codes);
process.stdout.write(JSON.stringify(out) + "\n");
