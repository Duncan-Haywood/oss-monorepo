#!/usr/bin/env node
// Reads each IFC5 (.ifcx) file that has the IFC4X3 STEP file it was
// converted from next to it, and compares what the checker sees in both
// (eval/ifcx-twins-2026-11-21.md):
// - objects: every IfcObject with a GlobalId in the STEP file, paired with
//   the IFC5 object whose path is that GlobalId; its class, predefined type
//   and Name compared;
// - properties: each property the STEP file gives a paired object (its
//   own, its type's), looked for in the IFC5 object's sets: under the same
//   set name with the same value, or only under another set;
// - verdicts: each IDS checked on both, compared as eval/ifcxml-twins.mjs
//   does ("identical": status, applicable count, failing GlobalIds; "same
//   for a user": status and failing GlobalIds).
//
//   node eval/ifcx-twins.mjs [--ids-dir DIR] <examples dir>
//   (pairs: X.ifc and X.ifcx in one folder, or X_IFC4X3.ifc and X_IFC5.ifcx;
//   sh eval/fetch-ifcx-twins.sh fetches them)
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { resources, check } from "../node.mjs";
import { Model, psetsOf, PropertyFacet } from "../ids.mjs";

const argv = process.argv.slice(2);
const idsAt = argv.indexOf("--ids-dir");
const IDS_DIR = idsAt >= 0 ? argv.splice(idsAt, 2)[1] : null;
const verbose = process.env.TWINS_VERBOSE;
const root = argv[0];
if (!root || !existsSync(root)) { console.error("usage: node eval/ifcx-twins.mjs [--ids-dir DIR] <examples dir> (run eval/fetch-ifcx-twins.sh first)"); process.exit(2); }
const R = resources();
const idsFiles = ["coordination-basics.ids.xml", "quantities-and-naming.ids.xml", "infrastructure-and-mep.ids.xml"]
  .map((f) => [f, readFileSync(new URL("../samples/" + f, import.meta.url), "utf8")]);
if (IDS_DIR) for (const f of readdirSync(IDS_DIR).filter((f) => /\.ids$/i.test(f)).sort()) idsFiles.push([f, readFileSync(join(IDS_DIR, f), "utf8")]);

const pairs = [];
const walk = (d) => {
  const names = readdirSync(d).sort();
  for (const n of names) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.ifc$/i.test(n)) continue;
    const base = n.replace(/\.ifc$/i, "");
    const twin = [base + ".ifcx", base.replace(/_IFC4X3$/i, "_IFC5") + ".ifcx"].find((x) => names.includes(x));
    if (twin) pairs.push([p, join(d, twin)]);
  }
};
walk(root);

const values = (m, p) => { try { const r = PropertyFacet.prototype.values.call({}, m, p); return (r.values || r).map((x) => (typeof x.v === "number" ? +x.v.toPrecision(6) : x.v)); } catch { return null; } };

// What the IFC5 file says about each paired object, written as an IDS (one
// specification per requirement, applying to the objects by GlobalId) and
// checked on both models: on the IFC5 read every one must hold; on the STEP
// twin, each that holds is a fact the reader put where STEP has it.
const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const sv = (x) => `<simpleValue>${esc(x)}</simpleValue>`;
const lex = (v) => (typeof v === "boolean" ? String(v) : typeof v === "number" ? String(v) : String(v));
function claimsIds(X, objects) {
  const groups = new Map(); // kind|xml -> {kind, xml, type, guids}
  const add = (kind, type, xml, g) => { const k = kind + "|" + type + "|" + xml; const r = groups.get(k) || { kind, type, xml, guids: [] }; r.guids.push(g); groups.set(k, r); };
  const relsOf = new Map();
  const S = X.schema;
  const refsIn = (v) => (Array.isArray(v) ? v.flatMap(refsIn) : v && v.ref !== undefined ? [v.ref] : []);
  for (const e of X.entities.values()) {
    const as = S.attrs(e.type);
    const rel = (from, to) => { for (const kid of refsIn(e.args[as.index.get(from)])) { const l = relsOf.get(kid) || []; l.push([e.type, X.entities.get(refsIn(e.args[as.index.get(to)])[0])]); relsOf.set(kid, l); } };
    if (e.type === "IFCRELAGGREGATES") rel("RelatedObjects", "RelatingObject");
    if (e.type === "IFCRELNESTS") rel("RelatedObjects", "RelatingObject");
    if (e.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE") rel("RelatedElements", "RelatingStructure");
    if (e.type === "IFCRELVOIDSELEMENT") rel("RelatedOpeningElement", "RelatingBuildingElement");
    if (e.type === "IFCRELFILLSELEMENT") rel("RelatedBuildingElement", "RelatingOpeningElement");
    if (e.type === "IFCRELASSIGNSTOGROUP") rel("RelatedObjects", "RelatingGroup");
    if (e.type === "IFCRELASSOCIATESMATERIAL") for (const o of refsIn(e.args[as.index.get("RelatedObjects")])) add("material", "", `<material><value>${sv(X.entities.get(refsIn(e.args[as.index.get("RelatingMaterial")])[0]).args[0])}</value></material>`, o);
    if (e.type === "IFCRELASSOCIATESCLASSIFICATION") {
      const r = X.entities.get(refsIn(e.args[as.index.get("RelatingClassification")])[0]);
      const ra = S.attrs(r.type);
      const sys = X.entities.get(refsIn(r.args[ra.index.get("ReferencedSource")])[0]).args[S.attrs("IFCCLASSIFICATION").index.get("Name")];
      for (const o of refsIn(e.args[as.index.get("RelatedObjects")])) add("classification", "", `<classification><value>${sv(r.args[ra.index.get("Identification")])}</value><system>${sv(sys)}</system></classification>`, o);
    }
  }
  const byId = new Map();
  for (const x of objects) {
    byId.set(x.id, x.args[0]);
    const pi = S.attrs(x.type).index.get("PredefinedType");
    const pdt = pi !== undefined && x.args[pi] && x.args[pi].enum;
    add("class", x.type, `<entity><name>${sv(x.type)}</name></entity>`, x.args[0]);
    if (pdt) add("predefined type", x.type, `<entity><name>${sv(x.type)}</name><predefinedType>${sv(pdt === "USERDEFINED" ? x.args[S.attrs(x.type).index.get("ObjectType")] : pdt)}</predefinedType></entity>`, x.args[0]);
    const fi = S.attrs(x.type).index.get("FlowDirection");
    if (fi !== undefined && x.args[fi] && x.args[fi].enum) add("flow direction", "", `<attribute><name>${sv("FlowDirection")}</name><value>${sv(x.args[fi].enum)}</value></attribute>`, x.args[0]);
    for (const [type, parent] of relsOf.get(x.id) || []) add("partOf", "", `<partOf relation="${type}"><entity><name>${sv(parent.type)}</name></entity></partOf>`, x.args[0]);
    for (const [sn, slot] of psetsOf(X, x)) for (const [pn, p] of slot.props) {
      const vs = values(X, p);
      if (!vs || vs.length !== 1) continue;
      add(sn.includes("::") ? "property, no template set" : "property", "", `<property><propertySet>${sv(sn)}</propertySet><baseName>${sv(pn)}</baseName><value>${sv(lex(vs[0]))}</value></property>`, x.args[0]);
    }
  }
  const specs = [];
  for (const r of groups.values()) {
    const guids = r.guids.map((g) => (typeof g === "number" ? byId.get(g) : g)).filter(Boolean);
    if (!guids.length) continue;
    specs.push({ kind: r.kind, n: guids.length, xml: `<specification name="${esc(r.kind)} ${specs.length}" ifcVersion="IFC4X3_ADD2"><applicability minOccurs="0" maxOccurs="unbounded"><attribute><name>${sv("GlobalId")}</name><value><xs:restriction base="xs:string">${guids.map((g) => `<xs:enumeration value="${esc(g)}"/>`).join("")}</xs:restriction></value></attribute></applicability><requirements>${r.xml}</requirements></specification>` });
  }
  const ids = `<?xml version="1.0" encoding="UTF-8"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>IFC5 claims</title></info><specifications>${specs.map((s) => s.xml).join("")}</specifications></ids>`;
  return { ids, specs };
}
const CLAIMS_MAX = Number(process.env.CLAIMS_MAX || 1500);
const claimSampled = [];
const C = new Map(); // kind -> [objects held on IFC5, held on STEP, total]
const claimFails = [];
const T = { nameIdent: 0, objects: 0, paired: 0, cls: 0, pdt: 0, name: 0, props: 0, propSame: 0, propOtherSet: 0, propValueDiff: 0, propMissing: 0, ids: 0, idsSame: 0, idsUser: 0, ifcxObjects: 0, ifcxOnly: 0, connS: 0, connX: 0, connSame: 0 };
const pdtDiffs = new Map();
const whyDiff = new Map();
const missingBySet = new Map(), otherSet = new Map(), diffs = [];
console.log("| pair | STEP objects | IFC5 objects | paired | class / predefined / Name same | STEP properties: same set+value / other set / value differs / missing | IDS verdicts identical / same for a user |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const [stepPath, ifcxPath] of pairs) {
  const S = new Model(readFileSync(stepPath), R.schemas, { psets: R.psets });
  const X = new Model(readFileSync(ifcxPath, "utf8"), R.schemas, { psets: R.psets });
  const objs = (M) => new Map([...M.entities.values()].filter((e) => M.isA(e, "IFCOBJECT") && typeof e.args[0] === "string").map((e) => [e.args[0], e]));
  const oS = objs(S), oX = objs(X);
  let paired = 0, cls = 0, pdt = 0, nm = 0, props = 0, same = 0, other = 0, vdiff = 0, miss = 0;
  for (const [g, e] of oS) {
    const x = oX.get(g);
    if (!x) continue;
    paired++;
    if (x.type === e.type) cls++;
    const pi = (M, o) => { const i = M.schema.attrs(o.type).index.get("PredefinedType"); return i === undefined ? "null" : JSON.stringify(o.args[i] ?? null); };
    const ps = pi(S, e), px = pi(X, x);
    if (ps === px || (ps === '{"enum":"NOTDEFINED"}' && px === "null")) pdt++;
    else if (verbose && pdtDiffs.size < 400) { const k = `${e.type} STEP ${ps} IFC5 ${px}`; pdtDiffs.set(k, (pdtDiffs.get(k) || 0) + 1); }
    // An IFC5 child name is the converter's key: the STEP Name with each
    // other character written _ and _001, _002 ... on a repeat (IfcOpenShell's
    // converter), or the Name and " (n)" (Tekla's).
    const ident = (n) => String(n ?? "").replace(/[^A-Za-z0-9_]/g, "_");
    if (e.args[2] !== x.args[2] && typeof x.args[2] === "string" && (ident(e.args[2]) === x.args[2] || ident(e.args[2]) === x.args[2].replace(/_\d{3}$/, "") || e.args[2] === x.args[2].replace(/ \(\d+\)$/, ""))) T.nameIdent++;
    if (e.args[2] === x.args[2]) nm++;
    else if (verbose && diffs.length < 40) diffs.push(`Name ${e.type} ${g}: STEP ${JSON.stringify(e.args[2])} IFC5 ${JSON.stringify(x.args[2])}`);
    const sx = psetsOf(X, x);
    const flatX = new Map();
    for (const [sn, slot] of sx) for (const [pn, p] of slot.props) flatX.set(pn, [sn, values(X, p)]);
    for (const [sn, slot] of psetsOf(S, e)) {
      for (const [pn, p] of slot.props) {
        props++;
        const vs = JSON.stringify(values(S, p));
        const xs = sx.get(sn);
        if (xs && xs.props.has(pn)) {
          if (JSON.stringify(values(X, xs.props.get(pn))) === vs) same++;
          else { vdiff++; if (verbose && diffs.length < 40) diffs.push(`value ${sn}.${pn} on ${e.type}: STEP ${vs} IFC5 ${JSON.stringify(values(X, xs.props.get(pn)))}`); }
        } else if (flatX.has(pn)) { other++; const k = `${sn} -> ${flatX.get(pn)[0]}`; otherSet.set(k, (otherSet.get(k) || 0) + 1); }
        else { miss++; missingBySet.set(sn, (missingBySet.get(sn) || 0) + 1); }
      }
    }
  }
  // Port connections (IfcRelConnectsPorts), compared as unordered GlobalId
  // pairs: IDS has no facet for them, so they are counted here.
  const conns = (M) => {
    const out = new Set();
    for (const e of M.entities.values()) {
      if (e.type !== "IFCRELCONNECTSPORTS") continue;
      const as = M.schema.attrs(e.type);
      const g = ["RelatingPort", "RelatedPort"].map((k) => { const r = e.args[as.index.get(k)]; const t = r && M.entities.get(r.ref); return t && t.args[0]; });
      if (g[0] && g[1]) out.add(g.sort().join(" "));
    }
    return out;
  };
  const cS = conns(S), cX = conns(X);
  T.connS += cS.size; T.connX += cX.size;
  for (const k of cX) if (cS.has(k)) T.connSame++;
  if (verbose) for (const k of cS) if (!cX.has(k)) diffs.push(`connection only in STEP: ${k}`);
  // At most CLAIMS_MAX objects a pair (every k-th): a GlobalId list of
  // thousands in each specification's applicability is tested against every
  // entity, which on TeklaHouse's 11,945 objects takes minutes.
  const allX = [...oX.entries()].filter(([g]) => oS.has(g)).map(([, x]) => x);
  const step = Math.ceil(allX.length / CLAIMS_MAX);
  const pairedX = allX.filter((_, i) => i % step === 0);
  claimSampled.push(pairedX.length < allX.length ? `${ifcxPath.slice(root.length + 1)}: ${pairedX.length} of ${allX.length}` : null);
  if (pairedX.length) {
    const { ids, specs } = claimsIds(X, pairedX);
    const rx = check(ids, X, { maxFailed: Infinity, audit: false }), rs = check(ids, S, { maxFailed: Infinity, audit: false });
    specs.forEach((sp, i) => {
      const c = C.get(sp.kind) || [0, 0, 0];
      c[2] += sp.n;
      c[0] += sp.n - rx.specs[i].failed.length;
      c[1] += sp.n - rs.specs[i].failed.length - (sp.n - rs.specs[i].applicable);
      C.set(sp.kind, c);
      if (rs.specs[i].failed.length && claimFails.length < 60) claimFails.push(`${ifcxPath.slice(root.length + 1)} ${sp.kind}: ${rs.specs[i].failed.length} of ${sp.n}: ${sp.xml.replace(/.*<requirements>|<\/requirements>.*/g, "").slice(0, 200)} -- ${(rs.specs[i].failed[0].reason || rs.specs[i].failed[0].reasons || "").toString().slice(0, 160)}`);
    });
  }
  let idsSame = 0, idsUser = 0;
  const v = (r) => JSON.stringify(r.specs.map((s) => [s.status, s.applicable, s.failed.map((f) => f.globalId).sort()]));
  const u = (r) => JSON.stringify(r.specs.map((s) => [s.status, s.failed.map((f) => f.globalId).filter(Boolean).sort()]));
  const idsDiff = [];
  for (const [f, ids] of idsFiles) {
    let a, b, ua, ub;
    try { const r = check(ids, S, { maxFailed: Infinity }); a = v(r); ua = u(r); } catch (e) { a = ua = "error " + e.message; }
    try { const r = check(ids, X, { maxFailed: Infinity }); b = v(r); ub = u(r); } catch (e) { b = ub = "error " + e.message; }
    if (a === b) idsSame++;
    if (ua === ub) idsUser++;
    else {
      idsDiff.push(f);
      // Why, by the first failing element's first reason on the side whose
      // failures the other lacks (names and values blanked so kinds group).
      try {
        const rs = check(ids, S, { maxFailed: Infinity }), rx = check(ids, X, { maxFailed: Infinity });
        rs.specs.forEach((sp, i) => {
          const xp = rx.specs[i];
          const gs = new Set(sp.failed.map((z) => z.globalId)), gx = new Set(xp.failed.map((z) => z.globalId));
          if (sp.status === xp.status && gs.size === gx.size && [...gs].every((g) => gx.has(g))) return;
          const onlyX = xp.failed.find((z) => !gs.has(z.globalId)), onlyS = sp.failed.find((z) => !gx.has(z.globalId));
          const side = onlyX ? "IFC5 fails, STEP passes or lacks it" : onlyS ? "STEP fails, IFC5 passes or lacks it" : "status only";
          const r = ((onlyX || onlyS || {}).reasons || [`${sp.status} / ${xp.status}, applicable ${sp.applicable} / ${xp.applicable}`])[0].replace(/"[^"]*"/g, "…").replace(/\b\d+(\.\d+)?\b/g, "N").slice(0, 110);
          const k = `${side}: ${r}`;
          whyDiff.set(k, (whyDiff.get(k) || 0) + 1);
        });
      } catch {}
    }
  }
  const name = ifcxPath.slice(root.length + 1);
  T.objects += oS.size; T.ifcxObjects += oX.size; T.paired += paired; T.cls += cls; T.pdt += pdt; T.name += nm;
  T.props += props; T.propSame += same; T.propOtherSet += other; T.propValueDiff += vdiff; T.propMissing += miss;
  T.ids += idsFiles.length; T.idsSame += idsSame; T.idsUser += idsUser;
  for (const g of oX.keys()) if (!oS.has(g)) T.ifcxOnly++;
  console.log(`| ${name} | ${oS.size} | ${oX.size} | ${paired} | ${cls} / ${pdt} / ${nm} | ${props}: ${same} / ${other} / ${vdiff} / ${miss} | ${idsSame} / ${idsUser} of ${idsFiles.length} |${X.parseErrors.length ? " reader: " + X.parseErrors.slice(0, 3).join("; ") : ""}${idsDiff.length ? " differ: " + idsDiff.slice(0, 6).join(", ") : ""}`);
}
console.log(`\n${pairs.length} pairs. Objects: ${T.paired} of ${T.objects} STEP objects paired (${T.ifcxOnly} IFC5 objects not in STEP); class same ${T.cls}, predefined type same ${T.pdt}, Name same ${T.name}, the same once the converter's key suffix or _ spelling is undone ${T.nameIdent}.`);
console.log(`STEP properties on paired objects: ${T.props}; same set and value in IFC5 ${T.propSame}; only under another set ${T.propOtherSet}; same set, value differs ${T.propValueDiff}; missing ${T.propMissing}.`);
console.log(`Port connections: ${T.connX} in IFC5, ${T.connSame} of them in STEP, of ${T.connS} in STEP.`);
console.log(`IDS verdicts: identical ${T.idsSame} of ${T.ids}; same status and failing GlobalIds ${T.idsUser} of ${T.ids}.`);
console.log("\nWhat the IFC5 file says about paired objects, as IDS requirements (objects): holds on the IFC5 read / holds on the STEP twin / stated");
if (claimSampled.some(Boolean)) console.log("(objects sampled, every k-th: " + claimSampled.filter(Boolean).join("; ") + ")");
for (const [k, [x, st, n]] of C) console.log(`- ${k}: ${x} / ${st} / ${n}`);
if (verbose) for (const f of claimFails) console.log("  " + f);
if (whyDiff.size) { console.log("\nSpecifications whose status or failing GlobalIds differ, by kind:"); for (const [k, n] of [...whyDiff].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`- ${n}: ${k}`); }
if (otherSet.size) console.log("other set: " + [...otherSet].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${k} ${n}`).join("; "));
if (missingBySet.size) console.log("missing by STEP set: " + [...missingBySet].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${k} ${n}`).join("; "));
for (const d of diffs) console.log("  " + d);
if (verbose) for (const [k, n] of [...pdtDiffs].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  predefined ${k}: ${n}`);
