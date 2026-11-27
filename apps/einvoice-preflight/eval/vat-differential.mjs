// Reads JSON cases from stdin (see vat-differential.py); reports valid numbers vat.mjs flags.
import { inspectPartyVat } from "../vat.mjs";
const cases = JSON.parse(await new Promise((r) => { let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => r(d)); }));
const by = {};
for (const c of cases) {
  const f = inspectPartyVat({ vat_id: c.cc + c.number }, "seller");
  const b = (by[c.cc] ??= { n: 0, rejected: 0, ex: [] });
  b.n++;
  if (f.length) { b.rejected++; if (b.ex.length < 4) b.ex.push(`${c.cc}${c.number}:${f[0].rule}`); }
}
for (const [cc, b] of Object.entries(by)) console.log(cc.padEnd(3), String(b.n).padStart(4), "valid;", String(b.rejected).padStart(4), "flagged", b.ex.join(" "));
