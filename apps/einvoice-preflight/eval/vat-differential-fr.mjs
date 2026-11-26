// stdin: cases from vat-differential-fr.py. Compares vat.mjs with python-stdnum both ways on French numbers.
import { inspectPartyVat } from "../vat.mjs";
const cases = JSON.parse(await new Promise((r) => { let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => r(d)); }));
let valid = 0, falseReject = [], falseAccept = [];
for (const c of cases) {
  const ok = !inspectPartyVat({ vat_id: c.cc + c.number }, "seller").length;
  if (c.valid) valid++;
  if (c.valid && !ok) falseReject.push(c.number);
  if (!c.valid && ok) falseAccept.push(c.number);
}
console.log(`${cases.length} numbers, ${valid} valid per stdnum; false rejects ${falseReject.length} ${falseReject.slice(0, 3)}; false accepts ${falseAccept.length} ${falseAccept.slice(0, 3)}`);
process.exitCode = falseReject.length || falseAccept.length ? 1 : 0;
