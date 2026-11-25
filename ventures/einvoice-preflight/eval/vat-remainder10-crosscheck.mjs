// Remainder-10 cross-check for Bulgarian (9-digit) and Czech (8- and 10-digit) VAT numbers.
// Generates every check digit for prefixes whose weighted sum lands on the special remainder,
// runs them through vat.mjs and writes the verdicts; eval/vat-remainder10-crosscheck.py then
// compares them with the Python CLI and python-stdnum.
//   node eval/vat-remainder10-crosscheck.mjs out.json [seed]
import fs from "node:fs";
import { inspectPartyVat } from "../vat.mjs";

let state = Number(process.argv[3] ?? 20261125) >>> 0;
const rand = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const digit = () => String(Math.floor(rand() * 10));
const w = (s, ws) => [...s].reduce((t, c, i) => t + Number(c) * ws[i], 0);
const prefixes = [];
const bg = { retry: 0, both: 0 };
while (bg.retry < 300 || bg.both < 100) {
  const p = Array.from({ length: 8 }, digit).join("");
  if (w(p, [1, 2, 3, 4, 5, 6, 7, 8]) % 11 !== 10) continue;
  const kind = w(p, [3, 4, 5, 6, 7, 8, 9, 10]) % 11 === 10 ? "both" : "retry";
  if (bg[kind] >= (kind === "both" ? 100 : 300)) continue;
  bg[kind] += 1;
  prefixes.push("BG" + p);
}
for (let n = 0; n < 300; ) {
  const p = String(1 + Math.floor(rand() * 8)) + Array.from({ length: 6 }, digit).join("");
  if (w(p, [8, 7, 6, 5, 4, 3, 2]) % 11 > 1) continue;
  prefixes.push("CZ" + p);
  n += 1;
}
for (let n = 0; n < 200; ) {
  const yy = 54 + Math.floor(rand() * 46);
  const mm = rand() < 0.5 ? 1 + Math.floor(rand() * 12) : 51 + Math.floor(rand() * 12);
  const dd = 1 + Math.floor(rand() * 28);
  const p = [yy, mm, dd].map((x) => String(x).padStart(2, "0")).join("") + String(Math.floor(rand() * 1000)).padStart(3, "0");
  if (Number(p) % 11 !== 10) continue;
  prefixes.push("CZ" + p);
  n += 1;
}
const verdicts = {};
for (const p of prefixes) {
  for (let d = 0; d < 10; d += 1) {
    const v = p + d;
    verdicts[v] = !inspectPartyVat({ vat_id: v }, "seller").some((f) => f.rule === "INV-023");
  }
}
fs.writeFileSync(process.argv[2], JSON.stringify(verdicts));
console.log(`${Object.keys(verdicts).length} numbers, ${Object.values(verdicts).filter(Boolean).length} accepted`);
