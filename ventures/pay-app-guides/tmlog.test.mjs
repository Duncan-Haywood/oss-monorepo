import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, corRows, ticketsCsv, requestLetter, sampleTickets, SAMPLE_SETTINGS, parseQty, parsePct, normType } from "./tmlog.mjs";
import * as colog from "./colog.mjs";

const byNo = (r, n) => r.tickets.find((t) => t.number === n);

test("sample: every ticket matches a hand calculation", () => {
  const r = compute(sampleTickets(), SAMPLE_SETTINGS);
  assert.deepEqual(r.errors, []);
  // 101: labor 8 x 68.25 + 8 x 41.50 = 878.00, +15% = 131.70; material 212.40, +10% = 21.24;
  // 1,243.34 x 1.5% = 18.6501 -> 18.65; total 1,261.99. Signed, 22 days old, no CO.
  const a = byNo(r, "101");
  assert.equal(a.costTotal, 109040); assert.equal(a.markupTotal, 15294); assert.equal(a.bond, 1865); assert.equal(a.total, 126199);
  assert.equal(a.status, "signed"); assert.equal(a.age, 22); assert.equal(a.hours, 16);
  // 102: 4.5 x 68.25 = 307.125 -> 307.13 (half up), +15% = 46.0695 -> 46.07; lift 185.00 +10% = 18.50;
  // 556.70 x 1.5% = 8.3505 -> 8.35; total 565.05. Unsigned.
  const b = byNo(r, "102");
  assert.equal(b.cost.labor, 30713); assert.equal(b.markup.labor, 4607); assert.equal(b.bond, 835); assert.equal(b.total, 56505);
  assert.equal(b.status, "unsigned");
  // 103: 474.00 + 71.10, 387.00 + 38.70 = 970.80, bond 14.562 -> 14.56; total 985.36, on CO-6.
  const c = byNo(r, "103");
  assert.equal(c.total, 98536); assert.equal(c.status, "on-co");
  const t = r.totals;
  assert.equal(t.total, 126199 + 56505 + 98536);
  assert.equal(t.open, 126199 + 56505); assert.equal(t.openCount, 2);
  assert.equal(t.unsigned, 56505); assert.equal(t.stale, 126199); assert.equal(t.onCo, 98536);
  assert.deepEqual(r.cos, [{ number: "CO-6", total: 98536 }]);
  assert.ok(r.findings.some((f) => f.severity === "high" && /Ticket 102/.test(f.text) && /no GC signature/.test(f.text)));
  assert.ok(r.findings.some((f) => f.severity === "high" && /Ticket 101/.test(f.text) && /22 days ago/.test(f.text)));
  assert.ok(!r.findings.some((f) => /Ticket 103/.test(f.text)));
});

test("signed tickets with no CO become pending lines the change order log reads", () => {
  const r = compute(sampleTickets(), SAMPLE_SETTINGS);
  const csv = corRows(r);
  assert.equal(csv.split("\n").length, 2, "only ticket 101: 102 is unsigned, 103 is on a CO");
  const log = colog.compute(csv, { originalContract: "100000", asOf: "2026-11-25" });
  assert.deepEqual(log.errors, []);
  assert.equal(log.lines.length, 1);
  assert.equal(log.lines[0].status, "pending");
  assert.equal(log.lines[0].amount, 126199);
  assert.equal(log.lines[0].number, "TM-101");
});

test("the request letter lists only signed, unconverted tickets and adds up", () => {
  const r = compute(sampleTickets(), SAMPLE_SETTINGS);
  const l = requestLetter(r, { gc: "Hill Builders", project: "Elm St Clinic", sub: "Spark Electric", date: "2026-11-25" });
  assert.match(l, /Ticket 101, 2026-11-03, signed by R\. Diaz/);
  assert.doesNotMatch(l, /Ticket 102|Ticket 103/);
  assert.match(l, /Total requested: \$1,261\.99/);
  assert.match(l, /Labor: \$878\.00 cost \+ \$131\.70 markup/);
  assert.doesNotMatch(l, /lien|interest|attorney|legal/i);
  assert.equal(requestLetter(compute("Ticket,Qty,Rate\n1,1,10", {})), "", "nothing signed, no letter");
});

test("no markup is assumed when none is entered", () => {
  const r = compute("Ticket,Type,Qty,Rate,Signed by\n7,labor,2,50,GC", {});
  assert.equal(byNo(r, "7").total, 10000);
});

test("amount column: used when there is no quantity, and a qty x rate disagreement is flagged", () => {
  const r = compute("Ticket,Type,Qty,Rate,Amount\n1,material,,,\"$1,200.00\"\n2,labor,2,50,99", {});
  assert.deepEqual(r.errors, []);
  assert.equal(byNo(r, "1").total, 120000);
  assert.equal(byNo(r, "2").total, 10000);
  assert.ok(r.findings.some((f) => /qty x rate is \$100\.00 but the amount column says \$99\.00/.test(f.text)));
});

test("bad input is refused with the row named", () => {
  assert.match(compute("Ticket,Type,Qty,Rate\n1,labor,abc,50", {}).errors[0], /Row 2: quantity/);
  assert.match(compute("Ticket,Type,Qty,Rate\n1,pizza,1,50", {}).errors[0], /Row 2: type/);
  assert.match(compute("Ticket,Type,Qty,Rate\n1,labor,1,50", { markup: { labor: "150" } }).errors[0], /Labor markup/);
  assert.match(compute("Ticket,Type,Qty,Rate\n1,labor,1,50", { chaseDays: "1e3" }).errors[0], /whole number/);
  assert.match(compute("Type,Qty\nlabor,1", {}).errors[0], /No ticket column/);
  assert.match(compute("Ticket,Amount\n1,-50", {}).errors[0], /credit change order/);
});

test("parsers", () => {
  assert.equal(parseQty("7.5"), 75000); assert.equal(parseQty("1,000"), 10000000); assert.equal(parseQty("1e2"), null); assert.equal(parseQty(""), 0);
  assert.equal(parsePct("12.5%"), 1250); assert.equal(parsePct(""), 0); assert.equal(parsePct("101"), null);
  assert.equal(normType("Equip"), "equipment"); assert.equal(normType(""), null); assert.equal(normType("x"), undefined);
});

test("CSV export neutralises formula cells", () => {
  const r = compute('Ticket,Type,Qty,Rate,Signed by\n1,labor,1,10,"=HYPERLINK(""x"")"', {});
  assert.match(ticketsCsv(r), /'=HYPERLINK/);
});
