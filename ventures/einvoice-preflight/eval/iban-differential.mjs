// stdin: cases from iban-differential.py. Counts, per country, IBANs python-stdnum accepts that iban.mjs flags
// (false rejects) and IBANs stdnum rejects that iban.mjs passes (false accepts).
import { inspectPaymentIban } from "../iban.mjs";
const cases = JSON.parse(await new Promise((r) => { let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => r(d)); }));
const by = {};
for (const c of cases) {
  const flagged = inspectPaymentIban({ payment: { iban: c.number } }).length > 0;
  const b = (by[c.cc] ??= { valid: 0, fr: 0, invalid: 0, fa: 0, frEx: [], faEx: [] });
  if (c.valid) { b.valid++; if (flagged) { b.fr++; if (b.frEx.length < 2) b.frEx.push(c.number); } }
  else { b.invalid++; if (!flagged) { b.fa++; if (b.faEx.length < 2) b.faEx.push(c.number); } }
}
let tv = 0, tfr = 0, ti = 0, tfa = 0;
for (const [cc, b] of Object.entries(by)) {
  tv += b.valid; tfr += b.fr; ti += b.invalid; tfa += b.fa;
  if (b.fr || b.fa) console.log(cc.padEnd(3), `false rejects ${b.fr}/${b.valid}`.padEnd(26), `false accepts ${b.fa}/${b.invalid}`.padEnd(28), [...b.frEx, ...b.faEx].join(" "));
}
console.log(`total: ${tv} stdnum-valid (${tfr} flagged here), ${ti} stdnum-invalid (${tfa} pass here)`);
