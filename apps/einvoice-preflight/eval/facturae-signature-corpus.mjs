// Our Facturae signature check (facturae-signature.mjs) against signxml's verdicts
// on the files eval/facturae-signxml.py writes (signed with signxml, plus mutants).
// Usage: node eval/facturae-signature-corpus.mjs <dir written by facturae-signxml.py>
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkFacturaeSignature } from "../facturae-signature.mjs";

const dir = process.argv[2];
const verdicts = JSON.parse(readFileSync(join(dir, "verdicts.json"), "utf8"));
const rows = [];
let agree = 0;
const t0 = performance.now();
for (const name of Object.keys(verdicts).sort()) {
  const r = checkFacturaeSignature(readFileSync(join(dir, name + ".xml"), "utf8"));
  const errors = r.findings.filter((f) => f.severity !== "warning");
  const ours = errors.length ? errors.map((f) => f.rule).join("+") : "ok";
  const theirs = verdicts[name].signxml === "ok" ? "ok" : "reject";
  const same = (ours === "ok") === (theirs === "ok");
  if (same) agree++;
  rows.push({ name, ours, theirs, signxml: verdicts[name].signxml, same, messages: errors.map((f) => f.message) });
}
const ms = (performance.now() - t0) / rows.length;
const byKind = {};
for (const r of rows) {
  const kind = r.name.includes("~") ? r.name.split("~")[1] : "clean";
  const k = (byKind[kind] ||= { files: 0, agree: 0, ours: {} });
  k.files++; if (r.same) k.agree++;
  k.ours[r.ours] = (k.ours[r.ours] || 0) + 1;
}
console.log(JSON.stringify({ files: rows.length, agree, msPerFile: Math.round(ms * 10) / 10, byKind }, null, 1));
for (const r of rows.filter((x) => !x.same)) console.log("DISAGREE", r.name, "ours:", r.ours, "signxml:", r.signxml, r.messages.join(" | "));
if (process.argv.includes("--list")) for (const r of rows) console.log(r.name, r.ours, "|", r.signxml.slice(0, 70));
