// Seeded faults for the schema's WHERE rules (eval/where-rules-seeded-2026-11-24.md).
// Writes one known fault family at a time into real IFC files, runs
// where-rules.mjs on the original and on each seeded copy, and checks that the
// rule failures the seed adds are exactly the records it touched, under the
// rule it was meant to break, and that no failure the original had goes away.
//   node --stack-size=8000 eval/where-rules-seeded.mjs OUTDIR FILE.ifc...
// writes OUTDIR/<file>~<family>.ifc, OUTDIR/<file>~original.ifc and
// OUTDIR/manifest.json (each seed's expected {id, rule}) for
// eval/where_rules_seeded_ifcopenshell.py, which asks ifcopenshell.validate
// the same question of the same files.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { parseStep } from "../step.mjs";
import { Schema } from "../ids.mjs";
import { whereRules } from "../where-rules.mjs";

const D = new URL("../schema/", import.meta.url);
const SS = {}, RR = {};
for (const id of ["ifc2x3", "ifc4", "ifc4x3"]) { SS[id] = new Schema(JSON.parse(readFileSync(new URL(id + ".json", D)))); RR[id] = JSON.parse(readFileSync(new URL("rules-" + id + ".json", D))); }
const schemaId = (raw) => { raw = (raw || "").toUpperCase(); return raw.startsWith("IFC4X3") ? "ifc4x3" : raw.startsWith("IFC4") ? "ifc4" : raw.startsWith("IFC2X3") ? "ifc2x3" : null; };

// ---- STEP text editing: records by id, top-level arguments split raw ----
export function indexRecords(text) {
  const recs = new Map();
  const data = text.search(/\bDATA\s*;/);
  const re = /\/\*|#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/g;
  re.lastIndex = data;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] === undefined) { const e = text.indexOf("*/", re.lastIndex); if (e < 0) break; re.lastIndex = e + 2; continue; }
    const open = re.lastIndex - 1;
    const close = matchParen(text, open);
    recs.set(Number(m[1]), { id: Number(m[1]), type: m[2].toUpperCase(), start: m.index, open, close });
    re.lastIndex = close + 1;
  }
  return recs;
}
function matchParen(t, p) {
  let depth = 0;
  for (let i = p; i < t.length; i++) {
    const c = t[i];
    if (c === "'") { i++; while (i < t.length && !(t[i] === "'" && t[i + 1] !== "'")) i += t[i] === "'" ? 2 : 1; continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}
export function splitArgs(s) {
  const out = []; let depth = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") { let j = i + 1; while (j < s.length && !(s[j] === "'" && s[j + 1] !== "'")) j += s[j] === "'" ? 2 : 1; cur += s.slice(i, j + 1); i = j; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
const argsOf = (text, r) => splitArgs(text.slice(r.open + 1, r.close));

// Deterministic GlobalIds (IFC's base-64 alphabet), so seeded files are reproducible.
const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
let gidN = 0;
const gid = () => { let n = ++gidN, s = ""; for (let i = 0; i < 20; i++) { s = B64[(n * 2654435761 + i * 40503) % 64 >>> 0] + s; n = Math.floor(n / 3) + i; } return "'3S" + s + "'"; };

// ---- what each family needs from the schema ----
function ruleOwner(R, S, type, label) {
  for (let t = type; t && S.entities[t]; t = S.entities[t].super) {
    const w = R.entities[t] && R.entities[t].where;
    if (w && w.some((x) => x[0] === label)) return { name: t + "." + label, src: w.find((x) => x[0] === label)[1] };
  }
  return null;
}
const refs = (a) => [...(a || "").matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
const isNum = (a) => /^-?\d/.test(a);

// Each family returns { edits: Map(id -> new args array), append: [text], expect: [{id, rule}] } or null.
const FAMILIES = {
  // A USERDEFINED PredefinedType with nothing naming it: on the occurrence,
  // ObjectType cleared; on a type object, ElementType (or ProcessType...) cleared.
  // An IDS predefinedType facet reads exactly those attributes.
  "userdefined-unnamed"(ctx) {
    const { S, R, recs, text } = ctx;
    const out = { edits: new Map(), append: [], expect: [] };
    const seen = new Set();
    for (const r of recs.values()) {
      if (seen.has(r.type) || !S.has(r.type)) continue;
      const own = ruleOwner(R, S, r.type, "CorrectPredefinedType");
      if (!own) continue;
      const ats = S.attrs(r.type);
      const pi = ats.index.get("PredefinedType");
      const enumT = pi !== undefined && S.types[ats[pi].type];
      if (!enumT || !enumT.values || !enumT.values.includes("USERDEFINED")) continue;
      // The attribute the rule wants filled when USERDEFINED: the EXISTS(...) that is not PredefinedType.
      const named = [...own.src.matchAll(/EXISTS\s*\(\s*(?:SELF\\\w+\.)?(\w+)\s*\)/gi)].map((m) => m[1]).filter((n) => n !== "PredefinedType");
      if (named.length !== 1 || ctx.already(r.id, own.name)) continue;
      const ni = ats.index.get(named[0]);
      if (ni === undefined) continue;
      const a = argsOf(text, r);
      if (a.length !== ats.length) continue;
      seen.add(r.type);
      a[pi] = ".USERDEFINED."; a[ni] = "$";
      out.edits.set(r.id, a);
      out.expect.push({ id: r.id, rule: own.name });
    }
    return out.expect.length ? out : null;
  },
  // An occurrence typed by another class's type (a wall typed by a proxy type):
  // the properties it inherits through an IDS check are not a wall type's.
  "type-of-another-class"(ctx) {
    const { S, R, recs, text, newId } = ctx;
    if (!S.has("IFCBUILDINGELEMENTPROXYTYPE")) return null;
    const typed = new Map(); // occurrence id -> rel id
    for (const r of recs.values()) if (r.type === "IFCRELDEFINESBYTYPE") for (const o of refs(argsOf(text, r)[4])) typed.set(o, r.id);
    const out = { edits: new Map(), append: [], expect: [] };
    const seen = new Set();
    const oh = [...recs.values()].find((r) => r.type === "IFCOWNERHISTORY");
    for (const r of recs.values()) {
      if (seen.has(r.type) || !S.has(r.type)) continue;
      const own = ruleOwner(R, S, r.type, "CorrectTypeAssigned");
      if (!own || ctx.already(r.id, own.name)) continue;
      const foreign = r.type.startsWith("IFCBUILDINGELEMENTPROXY") ? "IFCWALLTYPE" : "IFCBUILDINGELEMENTPROXYTYPE";
      // An untyped occurrence gets a new relationship; a typed one is moved out
      // of a relationship that keeps at least one other member.
      if (typed.has(r.id)) {
        const rel = recs.get(typed.get(r.id)); const ra = out.edits.get(rel.id) || argsOf(text, rel);
        const members = refs(ra[4]);
        if (members.length < 2) continue;
        ra[4] = "(" + members.filter((x) => x !== r.id).map((x) => "#" + x).join(",") + ")";
        out.edits.set(rel.id, ra);
      }
      seen.add(r.type);
      const ats = S.attrs(foreign);
      const t = ats.map((x) => (x.name === "GlobalId" ? gid() : x.name === "OwnerHistory" && oh ? "#" + oh.id : x.name === "Name" ? "'seeded foreign type'" : x.name === "PredefinedType" ? ".NOTDEFINED." : "$"));
      const tid = newId();
      out.append.push(`#${tid}=${foreign}(${t.join(",")});`);
      const rid = newId();
      out.append.push(`#${rid}=IFCRELDEFINESBYTYPE(${gid()},${oh ? "#" + oh.id : "$"},$,$,(#${r.id}),#${tid});`);
      out.expect.push({ id: r.id, rule: own.name });
    }
    return out.expect.length ? out : null;
  },
  // Two property sets of one name on an object: an IDS property facet may read either.
  "duplicate-pset-name"(ctx) {
    const { S, R, recs, text, newId } = ctx;
    const own = ruleOwner(R, S, "IFCOBJECT", "UniquePropertySetNames");
    if (!own) return null;
    const out = { edits: new Map(), append: [], expect: [] };
    const seen = new Set();
    const oh = [...recs.values()].find((r) => r.type === "IFCOWNERHISTORY");
    for (const r of recs.values()) {
      if (r.type !== "IFCRELDEFINESBYPROPERTIES") continue;
      const a = argsOf(text, r);
      const ps = recs.get(refs(a[5])[0]);
      if (!ps || ps.type !== "IFCPROPERTYSET") continue;
      const objs = refs(a[4]).map((x) => recs.get(x)).filter((o) => o && S.isA(o.type, "IFCOBJECT"));
      const o = objs.find((x) => !seen.has(x.type) && !ctx.already(x.id, own.name));
      if (!o) continue;
      seen.add(o.type);
      const psa = argsOf(text, ps);
      const pid = newId(), sid = newId(), rid = newId();
      out.append.push(`#${pid}=IFCPROPERTYSINGLEVALUE('SeededProperty',$,IFCLABEL('seeded'),$);`);
      out.append.push(`#${sid}=IFCPROPERTYSET(${gid()},${oh ? "#" + oh.id : "$"},${psa[2]},$,(#${pid}));`);
      out.append.push(`#${rid}=IFCRELDEFINESBYPROPERTIES(${gid()},${oh ? "#" + oh.id : "$"},$,$,(#${o.id}),#${sid});`);
      out.expect.push({ id: o.id, rule: own.name });
      if (seen.size >= 3) break;
    }
    return out.expect.length ? out : null;
  },
  // Two properties of one name in one set.
  "duplicate-property-name"(ctx) {
    const { S, R, recs, text, newId } = ctx;
    const label = R.entities.IFCPROPERTYSET.where.find((w) => /UniquePropertyName/i.test(w[1]))[0];
    const own = ruleOwner(R, S, "IFCPROPERTYSET", label);
    for (const r of recs.values()) {
      if (r.type !== "IFCPROPERTYSET") continue;
      const a = argsOf(text, r);
      const p = recs.get(refs(a[4])[0]);
      if (!p || p.type !== "IFCPROPERTYSINGLEVALUE" || ctx.already(r.id, own.name)) continue;
      const nid = newId();
      a[4] = a[4].replace(/\)\s*$/, `,#${nid})`);
      return { edits: new Map([[r.id, a]]), append: [`#${nid}=IFCPROPERTYSINGLEVALUE(${argsOf(text, p).join(",")});`], expect: [{ id: r.id, rule: own.name }] };
    }
    return null;
  },
  // A negative quantity, one per quantity class in the file: an IDS value range
  // or a takeoff reads a length, area or volume below zero.
  "negative-quantity"(ctx) {
    const { S, R, recs, text } = ctx;
    const out = { edits: new Map(), append: [], expect: [] };
    const seen = new Set();
    for (const r of recs.values()) {
      if (seen.has(r.type) || !/^IFCQUANTITY(LENGTH|AREA|VOLUME|WEIGHT|COUNT|TIME)$/.test(r.type)) continue;
      const w = (R.entities[r.type] || {}).where || [];
      const rule = w.find((x) => /^\s*\w+Value\s*>=\s*0/.test(x[1]));
      if (!rule) continue;
      const vi = S.attrs(r.type).index.get(rule[1].match(/(\w+Value)/)[1]);
      const a = argsOf(text, r);
      if (!isNum(a[vi]) || ctx.already(r.id, r.type + "." + rule[0])) continue;
      seen.add(r.type);
      a[vi] = Number(a[vi]) === 0 ? "-1." : "-" + a[vi].replace(/^-/, "");
      out.edits.set(r.id, a);
      out.expect.push({ id: r.id, rule: r.type + "." + rule[0] });
    }
    return out.expect.length ? out : null;
  },
  // A 3D direction as a 2D placement's RefDirection.
  "3d-refdirection-in-2d"(ctx) { return placement2D(ctx, "RefDirection", (id) => `#${id}=IFCDIRECTION((1.,0.,0.));`); },
  // A 3D point as a 2D placement's Location.
  "3d-location-in-2d"(ctx) { return placement2D(ctx, "Location", (id) => `#${id}=IFCCARTESIANPOINT((0.,0.,0.));`); },
  // A negative value in a positive-length slot: a door's or window's
  // OverallHeight, which IDS attribute facets check.
  "negative-positive-length"(ctx) {
    const { S, recs, text } = ctx;
    const out = { edits: new Map(), append: [], expect: [] };
    for (const want of ["IFCDOOR", "IFCWINDOW"]) {
      const r = [...recs.values()].find((x) => S.has(x.type) && S.isA(x.type, want));
      if (!r) continue;
      const ats = S.attrs(r.type);
      const i = ats.index.get("OverallHeight");
      const a = argsOf(text, r);
      if (i === undefined || !isNum(a[i])) continue;
      a[i] = "-" + a[i].replace(/^-/, "");
      out.edits.set(r.id, a);
      out.expect.push({ id: r.id, rule: "IFCPOSITIVELENGTHMEASURE.WR1" });
    }
    return out.expect.length ? out : null;
  },
};

function placement2D(ctx, attr, mk) {
  const { S, R, recs, text, newId } = ctx;
  const rule = R.entities.IFCAXIS2PLACEMENT2D.where.find((w) => new RegExp(attr === "Location" ? "Location\\.Dim\\s*=\\s*2" : "RefDirection\\.Dim\\s*=\\s*2").test(w[1]));
  if (!rule) return null;
  // Not a representation context's world coordinate system, so no context rule joins in.
  const wcs = new Set();
  for (const r of recs.values()) if (r.type === "IFCGEOMETRICREPRESENTATIONCONTEXT") for (const x of refs(argsOf(text, r)[4])) wcs.add(x);
  // Nor a conic's position: a circle placed in 3D is a 3D curve, and the
  // composite curve or profile around it then breaks its own rules too
  // (seen on web-ifc's ISSUE_129 on the first run).
  for (const r of recs.values()) if (/^IFC(CIRCLE|ELLIPSE)$/.test(r.type)) for (const x of refs(argsOf(text, r)[0])) wcs.add(x);
  const r = [...recs.values()].find((x) => x.type === "IFCAXIS2PLACEMENT2D" && !wcs.has(x.id) && !ctx.already(x.id, "IFCAXIS2PLACEMENT2D." + rule[0]));
  if (!r) return null;
  const a = argsOf(text, r);
  const nid = newId();
  a[S.attrs("IFCAXIS2PLACEMENT2D").index.get(attr)] = "#" + nid;
  return { edits: new Map([[r.id, a]]), append: [mk(nid)], expect: [{ id: r.id, rule: "IFCAXIS2PLACEMENT2D." + rule[0] }] };
}

export function seedFile(text, family, before = new Set()) {
  const p0 = parseStep(text, { eager: true });
  const sid = schemaId(p0.schema);
  if (!sid) return null;
  const S = SS[sid], R = RR[sid];
  const recs = indexRecords(text);
  let max = 0; for (const k of recs.keys()) if (k > max) max = k;
  // A seed never lands on a record that already breaks its rule, so each one is a new fault.
  const ctx = { S, R, recs, text, newId: () => ++max, already: (id, rule) => before.has(id + " " + rule.toUpperCase()) };
  const seed = FAMILIES[family](ctx);
  if (!seed) return null;
  // Rewrite edited records back to front, then append before the DATA section's ENDSEC.
  let t = text;
  for (const [id, a] of [...seed.edits].sort((x, y) => recs.get(y[0]).open - recs.get(x[0]).open)) {
    const r = recs.get(id);
    t = t.slice(0, r.open + 1) + a.join(",") + t.slice(r.close);
  }
  const data = t.search(/\bDATA\s*;/);
  const end = t.slice(data).search(/\bENDSEC\s*;/) + data;
  t = t.slice(0, end) + seed.append.join("\n") + "\n" + t.slice(end);
  return { text: t, schema: sid, expect: seed.expect };
}

const runRules = (text) => {
  const p = parseStep(text, { eager: true });
  const sid = schemaId(p.schema);
  const r = whereRules(p, SS[sid], RR[sid]);
  return new Set(r.findings.map((x) => x.id + " " + x.attr.toUpperCase()));
};

export const FAMILY_NAMES = Object.keys(FAMILIES);
// One family on one file's text: what the seed meant to break, and what the
// rules then report that the original did not (added) or no longer (lost).
export function seedAndCheck(text, family, before = runRules(text)) {
  gidN = 0;
  const s = seedFile(text, family, before);
  if (!s) return null;
  const after = runRules(s.text);
  const want = s.expect.map((e) => e.id + " " + e.rule.toUpperCase());
  return { ...s, want, added: [...after].filter((k) => !before.has(k)), lost: [...before].filter((k) => !after.has(k)) };
}
export { runRules };

if (import.meta.url === `file://${process.argv[1]}`) {
  const [outDir, ...files] = process.argv.slice(2);
  mkdirSync(outDir, { recursive: true });
  const manifest = [];
  const tally = {};
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const base = basename(f).replace(/\.ifc$/i, "");
    const orig = join(outDir, `${base}~original.ifc`);
    writeFileSync(orig, text);
    const before = runRules(text);
    for (const fam of Object.keys(FAMILIES)) {
      gidN = 0;
      const s = seedFile(text, fam, before);
      if (!s) { console.log(`${base} ${fam}: nothing to seed in this file`); continue; }
      const out = join(outDir, `${base}~${fam}.ifc`);
      writeFileSync(out, s.text);
      const after = runRules(s.text);
      const added = [...after].filter((k) => !before.has(k));
      const lost = [...before].filter((k) => !after.has(k));
      const want = new Set(s.expect.map((e) => e.id + " " + e.rule.toUpperCase()));
      const hit = added.filter((k) => want.has(k));
      const extra = added.filter((k) => !want.has(k));
      const missed = [...want].filter((k) => !after.has(k));
      const ok = !extra.length && !missed.length && !lost.length;
      const t = (tally[fam] ||= { seeds: 0, fired: 0, extra: 0, lost: 0, files: 0 });
      t.files++; t.seeds += want.size; t.fired += hit.length; t.extra += extra.length; t.lost += lost.length;
      console.log(`${base} ${fam} (${s.schema}): ${want.size} seeded, ${hit.length} fired as expected${extra.length ? `, EXTRA ${extra.join("; ")}` : ""}${missed.length ? `, MISSED ${missed.join("; ")}` : ""}${lost.length ? `, LOST ${lost.join("; ")}` : ""} ${ok ? "ok" : "MISMATCH"}`);
      manifest.push({ original: orig, seeded: out, family: fam, schema: s.schema, expect: s.expect, ours: { added, lost } });
    }
  }
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log("\nfamily                      files  seeds  fired  extra  lost");
  for (const [k, v] of Object.entries(tally)) console.log(`${k.padEnd(27)} ${String(v.files).padStart(5)} ${String(v.seeds).padStart(6)} ${String(v.fired).padStart(6)} ${String(v.extra).padStart(6)} ${String(v.lost).padStart(5)}`);
}
