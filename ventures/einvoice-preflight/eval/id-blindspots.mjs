// How often does each tax-ID check digit miss a typo? For every ID validator in
// this folder: N seeded random IDs that pass, then every single-character
// substitution and every adjacent swap of two different characters, counting
// the mistyped IDs that still pass (each position is substituted from its own
// alphabet: letters in a Mexican RFC's name and homoclave, digits in its date). Synthetic IDs, not real registrations; the
// rules are the ones the modules implement (pinned on known numbers, not read
// from the authorities' specifications).
// Usage: node eval/id-blindspots.mjs [N] [seed] [--json]
import { checkDigit as mx, checkRfc } from "../mexico.mjs";
import { checkDigit as co, checkNit } from "../colombia.mjs";
import { checkDigit as cl, checkRut } from "../chile.mjs";
import { cnpjCheckDigits, checkBrazilId } from "../brazil.mjs";
import { checkDigit as pe, checkRuc } from "../peru.mjs";
import { checkDigit as ar, checkCuit } from "../argentina.mjs";
import { corporateCheckDigit, checkRegistrationNumber } from "../japan.mjs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const N = Number(args[0] || 300), seed0 = Number(args[1] || 7);
let s = seed0 >>> 0;
const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join("");
const DIG = "0123456789", LET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const rules = [
  { name: "Mexico RFC (company, 12)", alphabet: DIG, at: (i) => (i < 3 ? LET : i < 9 ? DIG : DIG + LET),
    gen: () => { const dd = String(1 + Math.floor(rnd() * 28)).padStart(2, "0"), mm = String(1 + Math.floor(rnd() * 12)).padStart(2, "0");
      const b = "ABC" + digits(2) + mm + dd + "A1"; return b + mx(b); }, ok: (x) => checkRfc(x).ok },
  { name: "Colombia NIT (9 digits + DV)", alphabet: DIG,
    gen: () => { const b = digits(9); return b + co(b); }, ok: (x) => checkNit(x.slice(0, -1) + "-" + x.slice(-1)).ok },
  { name: "Chile RUT (8 digits + DV)", alphabet: DIG,
    gen: () => { const b = String(60000000 + Math.floor(rnd() * 3e7)); return b + cl(b); }, ok: (x) => checkRut(x).ok },
  { name: "Brazil CNPJ (14 digits)", alphabet: DIG,
    gen: () => { const b = digits(12); return b + cnpjCheckDigits(b); }, ok: (x) => checkBrazilId(x).ok },
  { name: "Brazil CNPJ (alphanumeric)", alphabet: DIG + "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    gen: () => { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + DIG; const b = Array.from({ length: 12 }, () => A[Math.floor(rnd() * 36)]).join(""); return b + cnpjCheckDigits(b); }, ok: (x) => checkBrazilId(x).ok },
  { name: "Peru RUC (11 digits)", alphabet: DIG,
    gen: () => { const b = "20" + digits(8); return b + pe(b); }, ok: (x) => checkRuc(x).ok },
  { name: "Argentina CUIT (11 digits)", alphabet: DIG,
    gen: () => { const b = "30" + digits(8); return b + ar(b); }, ok: (x) => checkCuit(x).ok },
  { name: "Japan T-number (13 digits)", alphabet: DIG,
    gen: () => { const b = digits(12); return corporateCheckDigit(b) + b; }, ok: (x) => checkRegistrationNumber("T" + x).kind === "corporate" },
];

const out = [];
for (const r of rules) {
  let sub = 0, subMiss = 0, swp = 0, swpMiss = 0, base = 0;
  for (let k = 0; k < N; k++) {
    const id = r.gen();
    if (!r.ok(id)) { base++; continue; }
    for (let i = 0; i < id.length; i++) for (const c of r.at ? r.at(i) : r.alphabet) {
      if (c === id[i]) continue;
      const t = id.slice(0, i) + c + id.slice(i + 1);
      sub++; if (r.ok(t)) subMiss++;
    }
    for (let i = 0; i + 1 < id.length; i++) {
      if (id[i] === id[i + 1]) continue;
      const t = id.slice(0, i) + id[i + 1] + id[i] + id.slice(i + 2);
      swp++; if (r.ok(t)) swpMiss++;
    }
  }
  out.push({ name: r.name, generatedNotPassing: base, substitutions: sub, subMissPct: +(100 * subMiss / sub).toFixed(2), swaps: swp, swapMissPct: +(100 * swpMiss / swp).toFixed(2) });
}
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 1));
else for (const o of out) console.log(`${o.name.padEnd(30)} substitution ${String(o.subMissPct).padStart(5)}% of ${o.substitutions}   swap ${String(o.swapMissPct).padStart(5)}% of ${o.swaps}   (generator failures ${o.generatedNotPassing})`);
