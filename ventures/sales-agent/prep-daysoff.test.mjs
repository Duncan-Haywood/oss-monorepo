// Call prep and the follow-up read the prospect's own days off (added 2026-11-12): the same holidays / region /
// country columns the daily run reads, now in the brief, the agenda and the follow-up's checks.
import test from "node:test";
import assert from "node:assert/strict";
import { runPrep } from "./prep.mjs";
import { runFollowUp } from "./followup.mjs";

const offer = { product: "Route Planner", sender_name: "Sam", company: "Acme Routes", postal_address: "1 Main St, Springfield", unsubscribe: "Reply STOP to opt out" };

test("a Quebec prospect's brief lists their next days off, from the region column", () => {
  const prospects = "email,first_name,company,status,region\nmarie@exemple.example,Marie,Transports Exemple,interested,CA-QC\n";
  const d = runPrep({ email: "marie@exemple.example", prospects, today: "2026-06-20" });
  assert.equal(d.daysOff.spec, "ca-qc");
  assert.equal(d.daysOff.source, "prospects table");
  assert.equal(d.daysOff.today, "");
  // Saint-Jean-Baptiste (24 June) and Canada Day (1 July) both fall within 14 days of 20 June.
  assert.deepEqual(d.daysOff.soon.map((h) => h.date), ["2026-06-24", "2026-07-01"]);
  assert.match(d.brief, /## Their days off \(ca-qc, from the prospects table\)/);
  assert.match(d.brief, /2026-06-24/);
  assert.ok(d.agenda.some((a) => a.startsWith("Their office is closed on 2026-06-24")), d.agenda.join("\n"));
});

test("a call prepared on their holiday says to expect no answer", () => {
  const prospects = "email,first_name,company,status,country\ndana@brightline.example,Dana,Brightline,interested,US\n";
  const d = runPrep({ email: "dana@brightline.example", prospects, today: "2026-11-26" });
  assert.equal(d.daysOff.spec, "us-business");
  assert.equal(d.daysOff.today, "Thanksgiving Day");
  assert.match(d.brief, /\*\*Today: Thanksgiving Day\*\*/);
  assert.ok(d.agenda.some((a) => /^Today is Thanksgiving Day for them/.test(a)));
});

test("the CRM row's country is used when the prospects table names none", () => {
  const prospects = "email,first_name,company,status\nali@firm.example,Ali,Firm,interested\n";
  const crm = "Email,First Name,Last Name,Country\nali@firm.example,Ali,Khan,United Kingdom\n";
  const d = runPrep({ email: "ali@firm.example", prospects, crm, today: "2026-12-20" });
  assert.ok(d.daysOff, "a UK CRM row names a calendar");
  assert.equal(d.daysOff.source, "CRM export");
  assert.ok(d.daysOff.soon.some((h) => h.date === "2026-12-25"));
});

test("no column, or a country we have no calendar for, adds nothing", () => {
  const a = runPrep({ email: "x@y.example", prospects: "email,first_name,status\nx@y.example,X,interested\n", today: "2026-11-26" });
  const b = runPrep({ email: "x@y.example", prospects: "email,first_name,status,country\nx@y.example,X,interested,DE\n", today: "2026-11-26" });
  for (const d of [a, b]) { assert.equal(d.daysOff, null); assert.doesNotMatch(d.brief, /days off/i); }
});

test("a do-not-chase brief carries no day-off agenda line", () => {
  const prospects = "email,first_name,status,country\nq@z.example,Q,unsubscribed,US\n";
  const d = runPrep({ email: "q@z.example", prospects, today: "2026-11-26" });
  assert.ok(d.stop);
  assert.deepEqual(d.agenda, []);
});

test("the follow-up flags a next step dated on their holiday", () => {
  const prospects = "email,first_name,company,status,country\ndana@brightline.example,Dana,Brightline,interested,US\n";
  const on = runFollowUp({ email: "dana@brightline.example", prospects, offer, today: "2026-11-23", notes: "They plan routes in spreadsheets\nNext call on Thursday at 10am" });
  assert.equal(on.next.date, "2026-11-26");
  assert.ok(on.issues.some((i) => /falls on 2026-11-26, Thanksgiving Day for them \(us-business\)/.test(i)), on.issues.join("\n"));
  const off = runFollowUp({ email: "dana@brightline.example", prospects, offer, today: "2026-11-23", notes: "They plan routes in spreadsheets\nNext call on Friday at 10am" });
  assert.equal(off.next.date, "2026-11-27");
  assert.ok(!off.issues.some((i) => /for them/.test(i)));
});
