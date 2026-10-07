// Made-up freelancer used by "Try it with sample data". Built relative to
// `today` so the overdue, follow-up and quarterly figures always look alive.
// It is held in memory only: nothing here is ever written to a tool's store.
import { parseDate, isoDate } from "./calc.mjs";

function shift(today, days) {
  const d = parseDate(today);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function sampleBoxes(today, now = Date.now()) {
  const day = 86400000, y = today.slice(0, 4);
  const inv = (n, client, issuedAgo, dueIn, qty, rate, paid, sent = true) => ({ id: "s" + n, number: `INV-000${n}`, clientName: client, issued: shift(today, -issuedAgo), due: shift(today, dueIn), sent, void: false, taxRate: "", discountType: "none", lines: [{ desc: "Design work", qty: String(qty), rate: String(rate), taxable: true }], paid: String(paid) });
  return {
    invoices: { invoices: [
      inv(1, "Harbor Coffee Co.", 140, -110, 20, 85, 1700),
      inv(2, "Northwind Legal", 70, -40, 30, 95, 0),
      inv(3, "Harbor Coffee Co.", 35, -5, 12, 85, 0),
      inv(4, "Pine & Co.", 10, 20, 16, 90, 0),
      inv(5, "Pine & Co.", 2, 28, 8, 90, 0, false),
    ].map((i) => ({ ...i, issued: i.issued.startsWith(y) ? i.issued : `${y}-01-02` })) },
    estimates: { estimates: [
      { id: "e1", number: "EST-0001", clientName: "Lumen Dental", issued: shift(today, -6), sentOn: shift(today, -6), validUntil: shift(today, 24), sent: true, taxRate: "", discountType: "none", options: [{ name: "Good", lines: [{ desc: "Brand refresh", qty: "1", rate: "2400", taxable: true }] }, { name: "Best", lines: [{ desc: "Brand refresh + site", qty: "1", rate: "4800", taxable: true }] }] },
      { id: "e2", number: "EST-0002", clientName: "Pine & Co.", issued: shift(today, -50), sentOn: shift(today, -50), validUntil: shift(today, -20), sent: true, outcome: "accepted", acceptedOption: 0, taxRate: "", discountType: "none", options: [{ name: "Standard", lines: [{ desc: "Packaging", qty: "1", rate: "1500", taxable: true }] }] },
    ] },
    time: { entries: [
      { id: "t1", client: "Pine & Co.", project: "Packaging", start: now - 9 * day, manualSec: 6.5 * 3600, rate: "90" },
      { id: "t2", client: "Pine & Co.", project: "Packaging", start: now - 4 * day, manualSec: 5 * 3600, rate: "90" },
      { id: "t3", client: "Lumen Dental", project: "Pitch", start: now - 2 * day, manualSec: 3.25 * 3600, rate: "85" },
      { id: "t4", client: "Harbor Coffee Co.", project: "Menu", start: now - 60 * day, manualSec: 12 * 3600, rate: "85", billed: true },
    ], projects: [], settings: { rounding: "15", defaultRate: "85" } },
    expenses: { entries: [
      { id: "x1", date: `${y}-01-09`, vendor: "Adobe", cents: 5499, category: "other", receipt: true },
      { id: "x2", date: `${y}-02-14`, vendor: "Coworking desk", cents: 18000, category: "rent_property", receipt: true },
      { id: "x3", date: `${y}-03-03`, vendor: "Client lunch", cents: 8400, category: "meals", receipt: false },
      { id: "x4", date: `${y}-03-21`, vendor: "Wacom tablet", cents: 34900, category: "office", receipt: false },
    ] },
  };
}
