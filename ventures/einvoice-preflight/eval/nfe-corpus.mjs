// Brazil NF-e checker (nfe.mjs, PR #15210) on 35 NF-e/NFC-e XML files from two MIT-licensed
// open-source libraries (eval/nfe-corpus/README.md), then seeded faults on the files
// it reads clean. Run: node eval/nfe-corpus.mjs  (add --json for machine output)
// Prints, per file, the findings; then, per mutation, how many of the clean files
// raised the expected rule. Exits 1 if a seeded fault is missed.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkNfe, keyCheckDigit as accessKeyDigit } from "../nfe.mjs";

const dir = fileURLToPath(new URL("./nfe-corpus/", import.meta.url));
const files = [];
for (const src of ["sped-nfe", "nfelib"]) {
  for (const f of readdirSync(join(dir, src)).filter((f) => f.endsWith(".xml")).sort()) files.push({ name: `${src}/${f}`, text: readFileSync(join(dir, src, f), "utf8") });
}

const json = process.argv.includes("--json");
const out = { files: [], mutations: [] };
const clean = [];
for (const f of files) {
  const r = checkNfe(f.text);
  out.files.push({ file: f.name, model: r.meta.mod, version: r.meta.versao, tpAmb: r.meta.tpAmb, authorised: r.meta.authorised, rules: r.findings.map((x) => x.rule), skipped: r.skipped.length });
  if (!r.findings.length) clean.push(f);
}

// Each mutation edits the first match of a pattern; `expect` is the rule (and cStat) it must raise.
const bump = (v) => (Math.round(parseFloat(v) * 100) + 1) / 100;
const fix2 = (n) => n.toFixed(2);
const MUTATIONS = [
  { name: "one key digit changed (the number, position 34)", expect: ["BR-011", "BR-012"],
    edit: (t) => t.replace(/Id="NFe(\d{33})(\d)/, (_, a, d) => `Id="NFe${a}${(+d + 1) % 10}`) },
  { name: "key rebuilt with a fresh check digit but ide/nNF left", expect: ["BR-012"],
    edit: (t) => t.replace(/Id="NFe(\d{43})\d"/, (_, a) => { const k = a.slice(0, 33) + ((+a[33] + 1) % 10) + a.slice(34); return `Id="NFe${k}${accessKeyDigit(k)}"`; }) },
  { name: "ide/cNF changed", expect: ["BR-012"], edit: (t) => t.replace(/<cNF>(\d+)<\/cNF>/, (_, v) => `<cNF>${String((+v + 1) % 1e8).padStart(v.length, "0")}</cNF>`) },
  { name: "dhEmi a month later", expect: ["BR-012"], edit: (t) => t.replace(/<dhEmi>(\d{4})-(\d{2})/, (_, y, m) => `<dhEmi>${m === "12" ? +y + 1 : y}-${m === "12" ? "01" : String(+m + 1).padStart(2, "0")}`) },
  { name: "issuer CNPJ last digit changed", expect: ["BR-013", "BR-012"], edit: (t) => t.replace(/(<emit>\s*<CNPJ>\d{13})(\d)/, (_, a, d) => `${a}${(+d + 1) % 10}`) },
  { name: "first item vProd +0.01", expect: ["BR-021"], edit: (t) => t.replace(/(<det [\s\S]*?<vProd>)([\d.]+)/, (_, a, v) => `${a}${fix2(bump(v))}`) },
  { name: "vNF +0.01", expect: ["BR-030"], edit: (t) => t.replace(/<vNF>([\d.]+)/, (_, v) => `<vNF>${fix2(bump(v))}`) },
  { name: "ICMSTot/vICMS +0.01", expect: ["BR-021"], edit: (t) => t.replace(/(<ICMSTot>[\s\S]*?<vICMS>)([\d.]+)/, (_, a, v) => `${a}${fix2(bump(v))}`) },
  { name: "ICMSTot/vPIS +0.01", expect: ["BR-021"], edit: (t) => t.replace(/(<ICMSTot>[\s\S]*?<vPIS>)([\d.]+)/, (_, a, v) => `${a}${fix2(bump(v))}`) },
];
let missed = 0;
for (const m of MUTATIONS) {
  let applied = 0, caught = 0;
  const misses = [];
  for (const f of clean) {
    const t = m.edit(f.text);
    if (t === f.text) continue;
    applied++;
    const rules = new Set(checkNfe(t).findings.map((x) => x.rule));
    if (m.expect.every((r) => rules.has(r))) caught++;
    else misses.push(f.name);
  }
  missed += applied - caught;
  out.mutations.push({ mutation: m.name, expect: m.expect, applied, caught, misses });
}

if (json) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`${files.length} files, ${clean.length} read clean.\n`);
  for (const f of out.files) console.log(`${f.file.padEnd(62)} ${String(f.model).padEnd(3)} ${String(f.version).padEnd(5)} ${f.authorised ? "cStat 100" : "         "} ${f.rules.join(" ") || "clean"}`);
  console.log("\nSeeded faults on the clean files:");
  for (const m of out.mutations) console.log(`  ${m.mutation.padEnd(52)} ${m.caught}/${m.applied}${m.misses.length ? "  missed: " + m.misses.join(", ") : ""}`);
}
process.exit(missed ? 1 : 0);
