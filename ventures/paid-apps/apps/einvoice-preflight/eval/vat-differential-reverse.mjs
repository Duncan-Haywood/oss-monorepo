// stdin: cases from vat-differential-reverse.py. Counts numbers vat.mjs passes (no finding) but python-stdnum rejects.
import { inspectPartyVat } from "../vat.mjs";
const cases = JSON.parse(await new Promise((r) => { let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => r(d)); }));
const by = {};
for (const c of cases) {
  if (c.valid) continue;
  const f = inspectPartyVat({ vat_id: c.cc + c.number }, "seller");
  const b = (by[c.cc] ??= { n: 0, passed: 0, ex: [] });
  b.n++;
  if (!f.length) { b.passed++; if (b.ex.length < 3) b.ex.push(c.cc + c.number); }
}
for (const [cc, b] of Object.entries(by)) if (b.passed) console.log(cc.padEnd(3), `${b.passed}/${b.n} stdnum-invalid numbers pass`, b.ex.join(" "));
