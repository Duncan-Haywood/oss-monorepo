// Runs the Carta Porte 3.1 checks over public CFDI files and compares the schema verdict on
// each file's cartaporte31:CartaPorte subtree with xmllint on SAT's CartaPorte31.xsd. The
// files are not in the tree (third-party repositories; some are real waybills): fetch them
// first, as eval/cartaporte-public-files.md says.
//   node eval/cartaporte-public-files.mjs <xsd dir as for cartaporte-xsd-diff.mjs> file.xml ...
// Prints: files read, distinct files with the complement, xmllint agreement, and for each
// MX-07x rule the files it fires on, split by stamp (a real PAC's, SAT's test certificate
// SAT970701NN3 or a placeholder, none).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCfdi } from "../cfdi.mjs";

const [dir, ...files] = process.argv.slice(2);
const xsd = join(dir, "CartaPorte/CartaPorte31.xsd");
const SCHEMA = new Set(["MX-002", "MX-003", "MX-004", "MX-005", "MX-006"]);
const work = mkdtempSync(join(tmpdir(), "cp-public-"));
const seen = new Set(), rows = [];
for (const f of files) {
  const t = readFileSync(f, "utf8").replace(/^﻿/, "");
  if (!/http:\/\/www\.sat\.gob\.mx\/CartaPorte31/.test(t) || !/http:\/\/www\.sat\.gob\.mx\/cfd\/4/.test(t)) continue;
  const m = /<([A-Za-z0-9_]+):CartaPorte\b[\s\S]*<\/\1:CartaPorte>/.exec(t);
  const h = createHash("sha256").update(t).digest("hex");
  if (!m || seen.has(h)) continue;
  seen.add(h);
  const pre = m[1];
  let subtree = m[0];
  if (!new RegExp(`^<${pre}:CartaPorte\\b[^>]*xmlns:${pre}=`).test(subtree)) subtree = subtree.replace(new RegExp(`^<${pre}:CartaPorte\\b`), `<${pre}:CartaPorte xmlns:${pre}="http://www.sat.gob.mx/CartaPorte31"`);
  const p = join(work, `${rows.length}.xml`);
  writeFileSync(p, `<?xml version="1.0" encoding="UTF-8"?>\n${subtree}`);
  const r = checkCfdi(t);
  const pac = /RfcProvCertif="([^"]*)"/.exec(t)?.[1];
  const stamp = !pac ? "none" : pac === "SAT970701NN3" || pac.includes("ignore") ? "test" : "PAC";
  rows.push({ f, p, r, stamp, mine: !r.findings.some((x) => x.path.startsWith("/Comprobante/Complemento/CartaPorte") && SCHEMA.has(x.rule)) });
}
const out = spawnSync("xmllint", ["--noout", "--schema", xsd, ...rows.map((x) => x.p)], { encoding: "utf8", maxBuffer: 1 << 28 });
const lint = new Map();
for (const m of (out.stdout + out.stderr).matchAll(/(\S+\.xml) (validates|fails to validate)/g)) lint.set(m[1], m[2] === "validates");
const readable = rows.filter((x) => !x.r.findings.some((y) => y.rule === "MX-001"));
const agree = readable.filter((x) => (lint.get(x.p) ?? false) === x.mine).length;
console.log(`${files.length} files read, ${rows.length} distinct CFDI 4.0 files with the complement, ${rows.length - readable.length} not CFDIs (MX-001)`);
console.log(`schema verdict agrees with xmllint on ${agree} of ${readable.length}; xmllint-valid: ${rows.filter((x) => lint.get(x.p)).length}`);
const by = {};
for (const x of readable) for (const rule of new Set(x.r.findings.filter((y) => /^MX-07/.test(y.rule)).map((y) => y.rule))) ((by[rule] ||= { PAC: [], test: [], none: [] })[x.stamp]).push(x.f.split("/").pop());
const stamps = { PAC: readable.filter((x) => x.stamp === "PAC"), test: readable.filter((x) => x.stamp === "test"), none: readable.filter((x) => x.stamp === "none") };
console.log(`stamps: real PAC ${stamps.PAC.length}, test or placeholder ${stamps.test.length}, none ${stamps.none.length}`);
for (const [rule, s] of Object.entries(by).sort()) console.log(`  ${rule}: PAC ${s.PAC.length} (${s.PAC.join(" ")}), test ${s.test.length}, none ${s.none.length}`);
for (const x of stamps.PAC) console.log(`  PAC-stamped ${x.f.split("/").pop()}: ${x.r.findings.map((y) => y.rule).join(",") || "no finding"}`);
