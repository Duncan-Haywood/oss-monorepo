// Member length and steel weight from geometry against the stored figures.
//
//   node eval/member-length-weight.mjs model.ifc [more.ifc ...] [--json out.json] [--list N]
//
// For every column, beam, member and pile: the length read off the body
// (qto.mjs, memberLength: the extent along the extrusion) against a stored
// Length, and, where the material names steel (qto.mjs, isSteel), the
// computed volume times 7,850 kg/m3 against a stored weight. A pair agrees
// within 2%. Also counts the members a BoQ line would now price that it
// priced at 0 before (no stored Length, no stored weight).

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff, isSteel, STEEL_DENSITY, LINEAR_CLASS } from "../qto.mjs";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json"), listAt = args.indexOf("--list");
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const listN = listAt >= 0 ? Number(args[listAt + 1]) : 5;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json" && args[i - 1] !== "--list");

const storedOf = (r, kind, names) => { for (const n of names) for (const [k, q] of Object.entries(r.stored)) if (q.kind === kind && k.toLowerCase() === n) return q.value; return null; };
const agree = (c, s) => Math.abs(c - s) <= 0.02 * Math.abs(s) || Math.abs(c - s) < 1e-4;
const results = [];
for (const file of files) {
  let res;
  try { res = takeoff(parseStep(readFileSync(file))); } catch (err) { console.log(`${basename(file)}: not read (${err.message})`); continue; }
  const o = { model: basename(file), members: 0, lenStored: 0, lenComputed: 0, lenBoth: 0, lenAgree: 0, lenNew: 0, lenNone: 0, hostFigure: 0, boqStoredLen: 0, boqLen: 0, wStored: 0, steel: 0, steelBothW: 0, steelAgree: 0, wNew: 0, materials: {}, lenOff: [], wOff: [] };
  for (const r of res.rows) {
    if (!LINEAR_CLASS.test(r.ifcType) || r.isAssembly) continue;
    o.members++;
    const m = r.material ?? "(none)"; o.materials[m] = (o.materials[m] || 0) + 1;
    const sL = storedOf(r, "length", ["length", "netlength", "grosslength"]);
    const cL = r.computed?.status === "ok" ? r.computed.length ?? null : null;
    if (sL != null) o.lenStored++;
    if (cL != null) o.lenComputed++;
    if (sL != null && cL != null) { o.lenBoth++; if (agree(cL, sL)) o.lenAgree++; else o.lenOff.push({ host: r.lengthCheck?.reason === "host-figure", id: r.id, cls: r.ifcClass, name: r.name, stored: sL, computed: cL }); }
    if (sL == null && cL != null) o.lenNew++;
    if (r.lengthCheck?.reason === "host-figure") { o.hostFigure++; o.boqStoredLen += sL; o.boqLen += cL; }
    if (sL == null && cL == null) o.lenNone++;
    const sW = storedOf(r, "weight", ["netweight", "grossweight", "weight"]);
    if (sW != null) o.wStored++;
    const vol = r.computed?.status === "ok" ? (r.computed.net ?? r.computed.gross) : null;
    if (isSteel(r.material)) {
      o.steel++;
      if (sW != null && vol != null) { o.steelBothW++; const w = vol * STEEL_DENSITY; if (agree(w, sW)) o.steelAgree++; else o.wOff.push({ id: r.id, cls: r.ifcClass, name: r.name, material: r.material, stored: sW, computed: w }); }
      if (sW == null && vol != null) o.wNew++;
    }
  }
  results.push(o);
  const top = Object.entries(o.materials).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join("; ");
  console.log(`${o.model}: ${o.members} members; length stored ${o.lenStored}, computed ${o.lenComputed}, both ${o.lenBoth} (agree ${o.lenAgree}), new ${o.lenNew}, none ${o.lenNone}; host-figure ${o.hostFigure} (stored sum ${o.boqStoredLen.toFixed(1)} m, body sum ${o.boqLen.toFixed(1)} m); weight stored ${o.wStored}; steel ${o.steel}, stored+computed ${o.steelBothW} (agree ${o.steelAgree}), new ${o.wNew}`);
  if (o.members) console.log(`  materials: ${top}`);
  for (const x of o.lenOff.filter((x) => !x.host).slice(0, listN)) console.log(`  length off (no cause) #${x.id} ${x.cls} ${x.name ?? ""}: stored ${x.stored.toFixed(4)} computed ${x.computed.toFixed(4)}`);
  for (const x of o.wOff.slice(0, listN)) console.log(`  weight off #${x.id} ${x.cls} ${x.name ?? ""} (${x.material}): stored ${x.stored.toFixed(2)} computed ${x.computed.toFixed(2)}`);
}
const sum = (k) => results.reduce((a, o) => a + o[k], 0);
console.log(`TOTAL: ${sum("members")} members; length both ${sum("lenBoth")} agree ${sum("lenAgree")}; host-figure ${sum("hostFigure")}; new lengths ${sum("lenNew")}; none ${sum("lenNone")}; steel ${sum("steel")}, weight both ${sum("steelBothW")} agree ${sum("steelAgree")}; new weights ${sum("wNew")}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results.map(({ lenOff, wOff, ...o }) => ({ ...o, lenOff: lenOff.slice(0, 50), wOff: wOff.slice(0, 50) })), null, 1));
