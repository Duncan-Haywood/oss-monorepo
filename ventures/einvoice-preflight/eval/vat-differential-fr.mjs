// stdin: cases from vat-differential-fr.py. Verdict must equal python-stdnum fr.tva on every case.
import { inspectPartyVat } from "../vat.mjs";
const cases = JSON.parse(await new Promise((r) => { let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => r(d)); }));
let valid = 0, falseReject = [], falseAccept = [];
for (const c of cases) {
  const ok = inspectPartyVat({ vat_id: "FR" + c.number }, "seller").length === 0;
  if (c.valid) valid++;
  if (c.valid && !ok) falseReject.push(c.number);
  if (!c.valid && ok) falseAccept.push(c.number);
}
console.log(`${cases.length} cases, ${valid} valid; false rejects ${falseReject.length} ${falseReject.slice(0, 3)}; false accepts ${falseAccept.length} ${falseAccept.slice(0, 3)}`);
process.exit(falseReject.length + falseAccept.length ? 1 : 0);
