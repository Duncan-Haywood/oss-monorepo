import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, addDocuments } from "./engine.mjs";
import { detectRecurring, forecastCash, cashOnHand } from "./recurring.mjs";

const rows = (lines) => "Date,Description,Amount\n" + lines.join("\n") + "\n";
const monthly = (desc, amt, months, dom = 5) => months.map((m) => `2026-${m}-${String(dom).padStart(2, "0")},${desc},${amt}`);

function books(lines) {
  return importStatement(newBooks(), rows(lines), "1000").books;
}

test("monthly, weekly and retainer series are found; one-offs and irregular payees are not", () => {
  const b = books([
    ...monthly("LANDLORD RENT", "-1500.00", ["01", "02", "03", "04", "05", "06"]),
    ...monthly("ACME RETAINER", "4000.00", ["01", "02", "03", "04", "05", "06"], 28),
    ...["2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25", "2026-06-01", "2026-06-08"].map((d) => `${d},COFFEE BEANS CO,-80.00`),
    "2026-03-09,DELL LAPTOP,-2100.00",
    "2026-01-03,RANDOM VENDOR,-12.00", "2026-02-20,RANDOM VENDOR,-14.00", "2026-06-02,RANDOM VENDOR,-90.00",
  ]);
  const r = detectRecurring(b, { asOf: "2026-06-30" });
  const by = Object.fromEntries(r.map((x) => [x.payee, x]));
  assert.equal(by["landlord rent"].cadence, "monthly");
  assert.equal(by["landlord rent"].perYear, -1500 * 100 * 12);
  assert.equal(by["landlord rent"].next, "2026-07-05");
  assert.equal(by["acme retainer"].direction, "in");
  assert.equal(by["coffee beans"].cadence, "weekly");
  assert.ok(!Object.keys(by).some((k) => k.includes("dell") || k.includes("random")));
});

test("a missed payment is overdue, a long silence is lapsed, a price rise is flagged", () => {
  const b = books([
    ...monthly("GYM CLUB", "-40.00", ["01", "02", "03", "04"]),
    ...monthly("SAAS TOOL", "-20.00", ["01", "02", "03", "04", "05", "06"]),
    "2026-07-05,SAAS TOOL,-29.00",
    ...monthly("OLD CLIENT", "900.00", ["01", "02", "03"]),
  ]);
  const by = Object.fromEntries(detectRecurring(b, { asOf: "2026-07-20" }).map((x) => [x.payee, x]));
  assert.equal(by["gym club"].status, "lapsed");
  assert.equal(by["saas tool"].status, "amount changed");
  assert.match(by["saas tool"].note, /29\.00/);
  assert.equal(by["old client"].status, "lapsed");
  const b2 = books(monthly("GYM CLUB", "-40.00", ["01", "02", "03", "04"]));
  assert.equal(detectRecurring(b2, { asOf: "2026-06-01" })[0].status, "overdue");
});

test("month-end dates step to the last day of shorter months", () => {
  const b = books(["2026-01-31,POWER CO,-60.00", "2026-02-28,POWER CO,-60.00", "2026-03-31,POWER CO,-60.00"]);
  const r = detectRecurring(b, { asOf: "2026-04-01" });
  assert.equal(r[0].next, "2026-04-30");
});

test("forecast rolls the balance through recurring items and open invoices", () => {
  let b = books([
    "2026-01-01,OPENING DEPOSIT,5000.00",
    ...monthly("LANDLORD RENT", "-1500.00", ["02", "03", "04", "05", "06"]),
  ]);
  assert.equal(cashOnHand(b), 500000 - 750000);
  b = addDocuments(b, "type,number,date,due,party,amount,account\ninvoice,INV-1,2026-06-10,2026-07-15,Acme,4000.00,4000\n").books;
  const f = forecastCash(b, { asOf: "2026-06-30", days: 60 });
  assert.equal(f.start, -250000);
  assert.deepEqual(f.items.map((i) => [i.date, i.cents]), [["2026-07-05", -150000], ["2026-07-15", 400000], ["2026-08-05", -150000]]);
  assert.equal(f.end, -250000 - 150000 + 400000 - 150000);
  assert.equal(f.lowest.cents, -400000);
  assert.equal(f.runwayDays, 0);
  const g = forecastCash(books(["2026-01-01,OPENING DEPOSIT,2000.00", ...monthly("LANDLORD RENT", "-1500.00", ["02", "03", "04", "05", "06"])].concat(["2026-06-20,REFUND,20000.00"])), { asOf: "2026-06-30", days: 60 });
  assert.equal(g.runwayDays, null);
});

test("a lapsed series is left out of the forecast", () => {
  const b = books(monthly("GYM CLUB", "-40.00", ["01", "02", "03", "04"]));
  assert.equal(forecastCash(b, { asOf: "2026-12-01", days: 60 }).items.length, 0);
});
