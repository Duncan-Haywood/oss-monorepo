import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeLedger, normalizeReimbursements, reasonKind, normalizeShipments, analyzeInbound, inboundClaimText, analyze, claimText, summaryText, sampleCsv } from "./calc.mjs";

const NOW = Date.UTC(2026, 8, 29);
const DAY = 86400000;
const day = (n) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
const LH = "Date,FNSKU,ASIN,MSKU,Title,Disposition,Found,Lost,Damaged,Unknown Events\n";
const RH = "approval-date,reimbursement-id,reason,sku,quantity-reimbursed-total,amount-per-unit,amount-total\n";
const ledger = (body) => normalizeLedger(parseCsv(LH + body));
const reimb = (body) => normalizeReimbursements(parseCsv(RH + body));
const one = (r, sku) => r.rows.find((x) => x.sku === sku);

test("ledger losses are read as positive units and headers are found by alias", () => {
  const l = ledger(`${day(100)},F1,A1,SKU-1,Mug,SELLABLE,0,-3,-1,0\n`);
  assert.equal(l.items[0].lost, 3);
  assert.equal(l.items[0].damaged, 1);
  assert.match(normalizeLedger(parseCsv("a,b\n1,2")).error, /No header row/);
  assert.match(normalizeLedger([]).error, /empty/);
});

test("unreadable rows are skipped with a reason, not silently dropped", () => {
  const l = ledger(`${day(100)},F1,A1,SKU-1,Mug,S,0,-3,0,0\nnot a date,F1,A1,SKU-1,Mug,S,0,-3,0,0\nTotal,,,,,,0,-3,0,0\n${day(50)},F,A,,Mug,S,0,-1,0,0\n`);
  assert.equal(l.items.length, 1);
  assert.deepEqual(l.skipped.map((s) => s.reason), ["date not readable", "total row", "no SKU"]);
});

test("reason kinds separate lost, damaged, reversals and everything else", () => {
  assert.equal(reasonKind("Lost_Warehouse"), "lost");
  assert.equal(reasonKind("Damaged_Warehouse"), "damaged");
  assert.equal(reasonKind("Reimbursement_Reversal"), "reversal");
  assert.equal(reasonKind("CustomerReturn"), "other");
});

test("unreimbursed lost units are the claim; found and reimbursed units are netted off", () => {
  const l = ledger(`${day(200)},F,A,S1,Mug,S,1,-6,-2,0\n`);
  const r = reimb(`${day(150)},R1,Lost_Warehouse,S1,3,10.00,30.00\n`);
  const a = analyze(l.items, r.items, { asOf: NOW });
  const s = one(a, "S1");
  assert.equal(s.lost + s.damaged, 8);
  assert.equal(s.unclaimed, 4);
  assert.equal(s.claim, 4);
  assert.equal(s.unitValue, 10);
  assert.equal(s.claimNowValue, 40);
  assert.equal(a.summary.claimNowValue, 40);
});

test("customer-return reimbursements do not offset lost units, and reversals add them back", () => {
  const l = ledger(`${day(200)},F,A,S1,Mug,S,0,-4,0,0\n`);
  const other = analyze(l.items, reimb(`${day(150)},R1,CustomerReturn,S1,4,10.00,40.00\n`).items, { asOf: NOW });
  assert.equal(one(other, "S1").unclaimed, 4);
  const rev = analyze(l.items, reimb(`${day(150)},R1,Lost_Warehouse,S1,4,10.00,40.00\n${day(100)},R2,Reimbursement_Reversal,S1,4,10.00,40.00\n`).items, { asOf: NOW });
  assert.equal(one(rev, "S1").unclaimed, 4);
});

test("reimbursements go against the oldest losses first, so the newest stay claimable", () => {
  const l = ledger(`${day(560)},F,A,S1,Mug,S,0,-2,0,0\n${day(100)},F,A,S1,Mug,S,0,-2,0,0\n`);
  const a = analyze(l.items, reimb(`${day(90)},R1,Lost_Warehouse,S1,2,10.00,20.00\n`).items, { asOf: NOW });
  const s = one(a, "S1");
  assert.equal(s.unclaimed, 2);
  assert.equal(s.expired, 0);
  assert.equal(s.claim, 2);
});

test("aging: too recent to claim, expiring soon, inside the window, and past it", () => {
  const l = ledger([10, 200, 520, 700].map((n) => `${day(n)},F,A,S${n},Mug,S,0,-1,0,0`).join("\n") + "\n");
  const a = analyze(l.items, [], { asOf: NOW, defaultUnitValue: 25 });
  assert.equal(one(a, "S10").wait, 1);
  assert.equal(one(a, "S200").claim, 1);
  assert.equal(one(a, "S520").expiring, 1);
  assert.equal(one(a, "S700").expired, 1);
  assert.equal(a.summary.claimNowUnits, 2);
  assert.equal(a.summary.claimNowValue, 50);
  assert.equal(a.summary.expiredUnits, 1);
  assert.ok(a.findings.some((f) => /reach the 18-month limit/.test(f.title)));
});

test("the window and default value are editable inputs", () => {
  const l = ledger(`${day(200)},F,A,S1,Mug,S,0,-2,0,0\n`);
  assert.equal(one(analyze(l.items, [], { asOf: NOW, windowMonths: 6 }), "S1").expired, 2);
  assert.equal(one(analyze(l.items, [], { asOf: NOW, defaultUnitValue: 12 }), "S1").claimNowValue, 24);
  assert.equal(one(analyze(l.items, [], { asOf: NOW, defaultUnitValue: -5 }), "S1").unitValue, 20);
});

test("no reimbursements file is called out as an upper bound", () => {
  const l = ledger(`${day(200)},F,A,S1,Mug,S,0,-2,0,0\n`);
  const a = analyze(l.items, null, { asOf: NOW });
  assert.equal(a.summary.haveReimb, false);
  assert.match(a.findings[0].title, /No reimbursements file/);
  assert.match(summaryText(a), /upper bound/);
});

test("overpayment, unknown events and a late-starting reimbursement file are flagged", () => {
  const l = ledger(`${day(400)},F,A,S1,Mug,S,0,-1,0,0\n${day(300)},F,A,S2,Cup,S,0,-2,0,3\n`);
  const r = reimb(`${day(120)},R1,Lost_Warehouse,S1,5,10.00,50.00\n`);
  const a = analyze(l.items, r.items, { asOf: NOW });
  assert.ok(a.findings.some((f) => /reimbursed for more units/.test(f.title)));
  assert.ok(a.findings.some((f) => /Unknown Events/.test(f.title)));
  assert.ok(a.findings.some((f) => /starts later than the ledger/.test(f.title)));
  assert.equal(one(a, "S1").unclaimed, 0);
});

test("SKU matching ignores case and a SKU only in the reimbursements is left out", () => {
  const l = ledger(`${day(200)},F,A,Sku-1,Mug,S,0,-2,0,0\n`);
  const r = reimb(`${day(100)},R1,Lost_Warehouse,SKU-1,2,10.00,20.00\n${day(100)},R2,Lost_Warehouse,GHOST,1,5.00,5.00\n`);
  const a = analyze(l.items, r.items, { asOf: NOW });
  assert.equal(one(a, "Sku-1").unclaimed, 0);
  assert.ok(a.findings.some((f) => /not in the ledger/.test(f.title)));
});

test("a ledger with nothing lost or damaged says so", () => {
  const l = ledger(`${day(200)},F,A,S1,Mug,S,0,0,0,0\n`);
  assert.match(analyze(l.items, [], { asOf: NOW }).invalid, /no lost or damaged/);
});

test("the claim text states what the ledger shows and does not assert a payout is owed", () => {
  const l = ledger(`${day(200)},FX1,A,S1,Blue mug,S,0,-2,0,0\n`);
  const t = claimText(one(analyze(l.items, [], { asOf: NOW }), "S1"));
  assert.match(t, /SKU: S1 \(FNSKU FX1\)/);
  assert.match(t, /2 unit\(s\) I cannot match/);
  assert.match(t, /or tell me which reimbursement covers them/);
});

test("the built-in example reads cleanly and shows every state", () => {
  const s = sampleCsv(NOW);
  const l = normalizeLedger(parseCsv(s.ledger)), r = normalizeReimbursements(parseCsv(s.reimbursements));
  assert.equal(l.error, undefined);
  assert.equal(r.error, undefined);
  const a = analyze(l.items, r.items, { asOf: NOW });
  assert.ok(a.summary.claimNowUnits > 0 && a.summary.waitUnits > 0 && a.summary.expiringUnits > 0);
  assert.equal(one(a, "TEA-SMP-004").unclaimed, 0);
});

const SH = "Shipment ID,Created,MSKU,Units expected,Units located\n";
const ships = (body) => normalizeShipments(parseCsv(SH + body));

test("inbound reimbursements are their own kind and never offset warehouse losses", () => {
  assert.equal(reasonKind("Lost_Inbound"), "inbound");
  assert.equal(reasonKind("Damaged_Inbound"), "inbound");
  assert.equal(reasonKind("Lost_Warehouse"), "lost");
  const l = ledger(`${day(200)},F,A,S1,Mug,S,0,-2,0,0\n`);
  const r = reimb(`${day(100)},R1,Lost_Inbound,S1,2,10.00,20.00\n`);
  assert.equal(one(analyze(l.items, r.items, { asOf: NOW }), "S1").unclaimed, 2);
});

test("shipment shortages are sent minus received, aged against the 9-month window", () => {
  const s = ships(`FBA1,${day(100)},S1,100,90\nFBA2,${day(10)},S1,50,40\nFBA3,${day(300)},S1,20,15\nFBA4,${day(100)},S1,10,10\nFBA5,${day(100)},S1,10,12\n`);
  assert.equal(s.items.length, 5);
  const a = analyzeInbound(s.items, null, { asOf: NOW, defaultUnitValue: 10 });
  const st = (id) => a.rows.find((r) => r.id === id);
  assert.equal(st("FBA1").state, "claim");
  assert.equal(st("FBA2").state, "wait");
  assert.equal(st("FBA3").state, "expired");
  assert.equal(st("FBA4"), undefined);
  assert.equal(st("FBA5"), undefined);
  assert.equal(a.summary.claimUnits, 10);
  assert.equal(a.summary.claimValue, 100);
  assert.equal(a.summary.waitUnits, 10);
  assert.equal(a.summary.expiredUnits, 5);
});

test("an expiring shipment sorts first and inbound payments are netted oldest first", () => {
  const s = ships(`OLD,${day(250)},S1,20,10\nNEW,${day(100)},S1,20,10\n`);
  const r = reimb(`${day(50)},R1,Lost_Inbound,S1,12,8.00,96.00\n`);
  const a = analyzeInbound(s.items, r.items, { asOf: NOW, defaultUnitValue: 99 });
  const old = a.rows.find((x) => x.id === "OLD"), nw = a.rows.find((x) => x.id === "NEW");
  assert.equal(old.state, "paid");
  assert.equal(old.open, 0);
  assert.equal(nw.reimbursed, 2);
  assert.equal(nw.open, 8);
  assert.equal(nw.unitValue, 8);
  assert.equal(nw.value, 64);
  assert.equal(a.summary.paidUnits, 12);
  const e = analyzeInbound(ships(`E,${day(250)},S2,10,5\n`).items, null, { asOf: NOW });
  assert.equal(e.rows[0].state, "expiring");
});

test("shipment files are read by alias, with skipped rows named and the claim text neutral", () => {
  assert.match(normalizeShipments(parseCsv("a,b\n1,2")).error, /No header row/);
  assert.match(normalizeShipments([]).error, /empty/);
  const s = ships(`FBA1,${day(100)},S1,5,x\nFBA1,nope,S1,5,4\n,${day(100)},,5,4\nFBA1,${day(100)},S1,5,4\n`);
  assert.equal(s.items.length, 1);
  assert.deepEqual(s.skipped.map((q) => q.reason), ["unit count not readable", "date not readable", "no SKU"]);
  const t = inboundClaimText(analyzeInbound(s.items, null, { asOf: NOW }).rows[0]);
  assert.match(t, /Shipment ID: FBA1/);
  assert.match(t, /I sent 5 unit\(s\)/);
  assert.match(t, /or tell me where they were received/);
});

test("the example includes shipments in every state", () => {
  const x = sampleCsv(NOW);
  const s = normalizeShipments(parseCsv(x.shipments));
  assert.equal(s.error, undefined);
  const a = analyzeInbound(s.items, normalizeReimbursements(parseCsv(x.reimbursements)).items, { asOf: NOW });
  assert.ok(a.summary.claimUnits > 0 && a.summary.waitUnits > 0 && a.summary.expiringUnits > 0);
});
