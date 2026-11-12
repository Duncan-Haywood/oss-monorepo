// Measures the postal-code cross-check (mx-address.mjs: a Mexican address's municipality,
// locality and colonia against SAT's c_CodigoPostal and c_Colonia) on public CFDI files.
// The files are third-party and not in the tree: fetch them as eval/mx-address-public-files.md
// says, then
//   node eval/mx-address-public-files.mjs file.xml ...
// Every Domicilio element with Pais="MEX" in any namespace is read (Carta Porte 2.0, 3.0,
// 3.1; Comercio Exterior 1.1, 2.0), whatever the complement's version, because the address
// attributes are the same in all of them. Distinct files by content hash. Prints how many
// addresses carry each field as a code or as a name, and for each kind of disagreement the
// addresses it fires on, split by stamp: a real PAC's, SAT's test certificate
// (SAT970701NN3) or a placeholder, or none.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { addressProblems, cpInfo, cpColonias } from "../mx-address.mjs";
import { cpEstado } from "../cce20.mjs";
import { ESTADOS } from "../cce20-data.mjs";

const files = process.argv.slice(2);
const seen = new Set();
const tally = { files: 0, addresses: 0, coded: { Municipio: 0, Localidad: 0, Colonia: 0 }, named: { Municipio: 0, Localidad: 0, Colonia: 0 }, cpKnown: 0, colKnown: 0 };
const hits = {};
const stamps = { PAC: 0, test: 0, none: 0 };
const pacDetail = [];
const attrs = (s) => Object.fromEntries([...s.matchAll(/([A-Za-z]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

for (const f of files) {
  let t;
  try { t = readFileSync(f, "utf8").replace(/^﻿/, ""); } catch { continue; }
  if (!/http:\/\/www\.sat\.gob\.mx\/(CartaPorte|ComercioExterior)/.test(t)) continue;
  const h = createHash("sha256").update(t).digest("hex");
  if (seen.has(h)) continue;
  seen.add(h);
  const doms = [...t.matchAll(/<(?:[A-Za-z0-9_]+:)?Domicilio\b([^>]*)\/?>/g)].map((m) => attrs(m[1])).filter((d) => d.Pais === "MEX");
  if (!doms.length) continue;
  tally.files++;
  const pac = /RfcProvCertif="([^"]*)"/.exec(t)?.[1];
  const stamp = !pac ? "none" : pac === "SAT970701NN3" || /ignore|\{|\$/.test(pac) ? "test" : "PAC";
  stamps[stamp]++;
  const mine = [];
  for (const d of doms) {
    tally.addresses++;
    for (const k of ["Municipio", "Localidad", "Colonia"]) {
      if (d[k] === undefined) continue;
      const coded = k === "Municipio" ? /^\d{3}$/ : k === "Localidad" ? /^\d{2}$/ : /^\d{4}$/;
      tally[coded.test(d[k]) ? "coded" : "named"][k]++;
    }
    if (cpInfo(d.CodigoPostal)) tally.cpKnown++;
    if (cpColonias(d.CodigoPostal)) tally.colKnown++;
    let kind = null;
    if (d.Estado !== undefined && !ESTADOS.MEX.includes(d.Estado)) kind = "Estado not a c_Estado code";
    else if (d.CodigoPostal && /^\d{5}$/.test(d.CodigoPostal) && cpEstado(d.CodigoPostal) && cpEstado(d.CodigoPostal) !== d.Estado) kind = "postal code in another state";
    const kinds = kind ? [kind] : addressProblems(d).problems.map((q) => `${q.field} not the postal code's`);
    for (const k of kinds) {
      ((hits[k] ||= { PAC: 0, test: 0, none: 0 })[stamp])++;
      mine.push(`${k} (CP ${d.CodigoPostal}, ${d.Estado} ${d.Municipio ?? "-"} ${d.Localidad ?? "-"} ${d.Colonia ?? "-"})`);
    }
  }
  if (stamp === "PAC") pacDetail.push(`${f.split("/").pop()}: ${doms.length} address(es), ${mine.length ? mine.join("; ") : "no disagreement"}`);
}
console.log(`${files.length} files read; ${tally.files} distinct CFDIs with a Carta Porte or Comercio Exterior complement and a Mexican Domicilio; ${tally.addresses} Mexican addresses`);
console.log(`stamps: real PAC ${stamps.PAC}, test or placeholder ${stamps.test}, none ${stamps.none}`);
console.log(`written as a code / as a name: ${["Municipio", "Localidad", "Colonia"].map((k) => `${k} ${tally.coded[k]}/${tally.named[k]}`).join(", ")}`);
console.log(`postal codes whose catalogue row names a municipality: ${tally.cpKnown} of ${tally.addresses}; with colonias listed: ${tally.colKnown}`);
for (const [k, s] of Object.entries(hits).sort()) console.log(`  ${k}: PAC ${s.PAC}, test ${s.test}, none ${s.none}`);
for (const line of pacDetail) console.log(`  PAC-stamped ${line}`);
