import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditInvoice, auditFromFlat, parseInvoiceCsv, classifyDescription, disputeNote, toCsv, encodeState, decodeState,
  normalizeRateCard, normalizeRecords, CATEGORIES,
} from './calc.mjs';

const CARD = {
  receivingPerPallet: 6.5, receivingPerCarton: 0.35, storagePerPalletMonth: 18, storagePerBinMonth: 3.5, longTermStoragePerPalletMonth: 8,
  pickFirst: 1.85, pickAdditional: 0.45, packPerOrder: 0.6, returnsPerUnit: 2.25, kittingPerKit: 1.2, accountMinimum: 1500, fuelSurchargePct: 4,
};
const RECORDS = { ordersShipped: 3200, unitsShipped: 4900, palletsReceived: 40, avgPalletsOnHand: 210, avgBinsOnHand: 120, returnsProcessed: 140 };
const CSV = `description,qty,rate,amount
Receiving - pallet,40,6.50,260.00
Pallet storage (monthly),240,18.00,4320.00
Bin storage (monthly),120,3.50,420.00
Pick fee - first unit,3200,2.10,6720.00
Pick fee - each additional unit,1700,0.45,765.00
Pack / materials,3350,0.60,2010.00
Returns processing,140,2.25,315.00
Returns processing,140,2.25,315.00
Account minimum,1,1500,1500.00
Special project fee,1,250,250.00
Fuel surcharge,1,,480.00`;

const run = (csv, card = CARD, records = RECORDS) => auditInvoice({ rateCard: card, records, invoiceCsv: csv });
const one = (csv, card, records) => run(`description,qty,rate,amount\n${csv}`, card, records).lines[0];

test('the worked example matches a hand count to the cent', () => {
  const r = run(CSV);
  // rate 800 (3200 x 0.25) + storage 540 (30 x 18) + pack 90 (150 x 0.60) + duplicate 315
  // + minimum 1500 + unlisted 250 + fuel (480 - 4% of 9180 = 367.20) 112.80
  assert.equal(r.totals.recoverable, 3607.8);
  assert.equal(r.totals.billed, 17355);
  assert.equal(r.totals.supported, 13747.2);
  assert.equal(r.totals.flaggedLines, 7);
  assert.deepEqual(r.ranked.map((l) => [l.rank, l.index, l.overcharge]), [
    [1, 9, 1500], [2, 4, 800], [3, 2, 540], [4, 8, 315], [5, 10, 250], [6, 11, 112.8], [7, 6, 90],
  ]);
});

test('lines with no problem carry no overcharge and an expected amount', () => {
  const r = run(CSV);
  const byIndex = (i) => r.lines.find((l) => l.index === i);
  for (const i of [1, 3, 5, 7]) assert.equal(byIndex(i).overcharge, 0);
  assert.equal(byIndex(1).expectedAmount, 260);
  assert.equal(byIndex(5).recordedQty, 1700); // 4900 units - 3200 orders
});

test('rate above contract: (billed - contract) x billed quantity', () => {
  const l = one('Pick fee first unit,100,2.00,200', CARD, { ordersShipped: 100 });
  assert.equal(l.overcharge, 15);
  assert.equal(l.issues[0].type, 'rate');
  assert.deepEqual(l.proof, ['Signed contract: Pick and pack schedule']);
});

test('rate below contract is never credited against another line', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,100,1.50,150\nPack,100,0.80,80', CARD, { ordersShipped: 100 });
  assert.equal(r.lines[0].overcharge, 0);
  assert.equal(r.lines[1].overcharge, 20);
  assert.equal(r.totals.recoverable, 20);
});

test('quantity mismatch is priced at the lower of billed and contract rate', () => {
  // billed 120 orders at 1.50 (below contract 1.85), only 100 shipped: 20 x 1.50
  const l = one('Pick fee first unit,120,1.50,180', CARD, { ordersShipped: 100 });
  assert.equal(l.overcharge, 30);
  assert.equal(l.issues[0].type, 'quantity');
});

test('rate and quantity overages add exactly: billed total minus contract x recorded quantity', () => {
  const l = one('Pick fee first unit,120,2.00,240', CARD, { ordersShipped: 100 });
  assert.equal(l.overcharge, 240 - 185);
  assert.equal(l.issues.map((x) => x.type).join(), 'rate,quantity');
});

test('arithmetic: amount above qty x rate is its own recoverable piece', () => {
  const l = one('Pick fee first unit,100,1.85,200', CARD, { ordersShipped: 100 });
  assert.equal(l.overcharge, 15);
  assert.equal(l.issues[0].type, 'math');
});

test('storage billed on more pallets than average on-hand names the WMS snapshot', () => {
  const l = one('Pallet storage,240,18,4320', CARD, { avgPalletsOnHand: 210 });
  assert.equal(l.overcharge, 540);
  assert.equal(l.issues[0].type, 'storage');
  assert.match(l.proof[0], /WMS inventory snapshots/);
});

test('billed quantity below the records is fine', () => {
  const l = one('Pallet storage,200,18,3600', CARD, { avgPalletsOnHand: 210 });
  assert.equal(l.overcharge, 0);
  assert.equal(l.status, 'ok');
});

test('no record entered: quantity taken as billed, flagged as unverified', () => {
  const r = run('description,qty,rate,amount\nPallet storage,240,18,4320', CARD, {});
  assert.equal(r.totals.recoverable, 0);
  assert.deepEqual(r.unverified, ['Storage per pallet per month']);
  assert.match(r.lines[0].note, /taken as billed/);
});

test('duplicates: only the repeats are recoverable, the first stays', () => {
  const r = run('description,qty,rate,amount\nKitting,10,1.20,12\nkitting ,10,1.20,12\nKitting,10,1.20,12', CARD, { });
  assert.deepEqual(r.lines.map((l) => l.overcharge), [0, 12, 12]);
  assert.equal(r.lines[1].issues[0].type, 'duplicate');
});

test('same description with a different quantity is not a duplicate', () => {
  const r = run('description,qty,rate,amount\nKitting,10,1.20,12\nKitting,11,1.20,13.2', CARD, {});
  assert.equal(r.totals.recoverable, 0);
});

test('a duplicate is not also charged a rate or quantity overage', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,100,2.00,200\nPick fee first unit,100,2.00,200', CARD, { ordersShipped: 100 });
  assert.deepEqual(r.lines.map((l) => l.overcharge), [15, 200]);
});

test('a charge not in the rate card is recoverable in full, with the contract as proof', () => {
  const l = one('Admin fee,1,75,75');
  assert.equal(l.overcharge, 75);
  assert.equal(l.issues[0].type, 'unlisted');
  assert.match(l.proof[0], /full rate schedule/);
});

test('a known category that the rate card leaves blank is also unlisted', () => {
  const card = { ...CARD, kittingPerKit: null };
  const l = one('Kitting,10,1.20,12', card);
  assert.equal(l.overcharge, 12);
  assert.match(l.issues[0].detail, /no kitting fee/);
});

test('minimum double billing: the whole minimum line is recoverable when charges already reach it', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,1000,1.85,1850\nMonthly account minimum,1,1500,1500', CARD, { ordersShipped: 1000 });
  assert.equal(r.lines[1].overcharge, 1500);
  assert.equal(r.lines[1].issues[0].type, 'minimum');
});

test('minimum: a top-up equal to the shortfall is correct', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,500,1.85,925\nMonthly account minimum,1,575,575', CARD, { ordersShipped: 500 });
  assert.equal(r.totals.recoverable, 0);
  assert.equal(r.lines[1].expectedAmount, 575);
});

test('minimum: a top-up larger than the shortfall loses only the excess', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,500,1.85,925\nMonthly account minimum,1,1500,1500', CARD, { ordersShipped: 500 });
  assert.equal(r.lines[1].overcharge, 925);
  assert.equal(r.lines[1].issues[0].type, 'minimum_excess');
});

test('minimum is judged on corrected charges, so fixing other lines can make the top-up legitimate', () => {
  // Pick billed 1000 x 3.00 = 3000 but contract supports 1000 x 1.85 = 1850 ... still above 1500.
  // Use 300 orders: contract 555; billed 900 at 3.00; minimum billed 600 (1500 - 900) is a fair top-up
  // on the billed total but the true shortfall is 1500 - 555 = 945, so 600 is not an overcharge.
  const r = run('description,qty,rate,amount\nPick fee first unit,300,3.00,900\nAccount minimum,1,600,600', CARD, { ordersShipped: 300 });
  assert.equal(r.lines[0].overcharge, 345);
  assert.equal(r.lines[1].overcharge, 0);
});

test('minimum line with no minimum in the contract is unlisted', () => {
  const r = run('description,qty,rate,amount\nAccount minimum,1,500,500', { ...CARD, accountMinimum: null }, {});
  assert.equal(r.lines[0].overcharge, 500);
});

test('fuel surcharge is judged against the corrected base, excluding storage', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,1000,1.85,1850\nPallet storage,100,18,1800\nFuel surcharge,1,,100', CARD, { ordersShipped: 1000, avgPalletsOnHand: 100 });
  assert.equal(r.lines[2].expectedAmount, 74); // 4% of 1850
  assert.equal(r.lines[2].overcharge, 26);
});

test('fuel surcharge at or under the contracted percent is clean', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,1000,1.85,1850\nFuel surcharge,1,,74', CARD, { ordersShipped: 1000 });
  assert.equal(r.totals.recoverable, 0);
});

test('handling surcharge uses its own percent', () => {
  const r = run('description,qty,rate,amount\nPack,1000,0.6,600\nSpecial handling surcharge,1,,60', { ...CARD, handlingSurchargePct: 5 }, { ordersShipped: 1000 });
  assert.equal(r.lines[1].category, 'handling');
  assert.equal(r.lines[1].overcharge, 30);
});

test('surcharge with no percent in the contract is unlisted', () => {
  const r = run('description,qty,rate,amount\nFuel surcharge,1,,40', { ...CARD, fuelSurchargePct: null }, {});
  assert.equal(r.lines[0].overcharge, 40);
  assert.equal(r.lines[0].issues[0].type, 'unlisted');
});

test('credits are listed but never audited or counted as overcharges', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,100,1.85,185\nCredit - damaged goods,1,,(50.00)', CARD, { ordersShipped: 100 });
  assert.equal(r.lines[1].status, 'credit');
  assert.equal(r.totals.credits, -50);
  assert.equal(r.totals.billed, 185);
  assert.equal(r.totals.recoverable, 0);
});

test('ambiguous receiving line goes to needs-review instead of guessing', () => {
  const r = run('description,qty,rate,amount\nReceiving,10,6.50,65', CARD, {});
  assert.equal(r.lines[0].status, 'needs-review');
  assert.equal(r.needsReview.length, 1);
  assert.equal(r.totals.recoverable, 0);
});

test('receiving is unambiguous when only one rate is in the card', () => {
  assert.equal(classifyDescription('Receiving', { receivingPerPallet: 6.5 }).category, 'receiving_pallet');
  assert.equal(classifyDescription('Receiving', { receivingPerCarton: 0.35 }).category, 'receiving_carton');
});

test('an explicit category column overrides the description', () => {
  const r = run('description,qty,rate,amount,category\nInbound handling,10,6.50,65,receiving_pallet', CARD, { palletsReceived: 10 });
  assert.equal(r.lines[0].category, 'receiving_pallet');
  assert.equal(r.lines[0].overcharge, 0);
});

test('classification of common 3PL wording', () => {
  const c = (d) => classifyDescription(d, CARD).category;
  assert.equal(c('Pick - each additional item'), 'pick_additional');
  assert.equal(c('Pick fee'), 'pick_first');
  assert.equal(c('Receiving per carton'), 'receiving_carton');
  assert.equal(c('Bin storage'), 'storage_bin');
  assert.equal(c('Storage - 180+ days'), 'long_term_storage');
  assert.equal(c('Long-term storage surcharge'), 'long_term_storage');
  assert.equal(c('Return processing (RMA)'), 'returns');
  assert.equal(c('Kitting / assembly'), 'kitting');
  assert.equal(c('Packaging materials'), 'pack');
  assert.equal(c('Monthly minimum'), 'minimum');
  assert.equal(c('Fuel / energy surcharge'), 'fuel');
  assert.equal(c('Photography'), null);
});

test('long-term storage uses its own record count', () => {
  const l = one('Long-term storage,30,8,240', CARD, { longTermPallets: 20 });
  assert.equal(l.overcharge, 80);
});

test('totals: ranking is by dollars, ties keep invoice order', () => {
  const r = run('description,qty,rate,amount\nAdmin fee,1,10,10\nOther fee,1,10,10\nMisc fee,1,20,20', CARD, {});
  assert.deepEqual(r.ranked.map((l) => l.index), [3, 1, 2]);
});

test('an overcharge never exceeds the line amount', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,100,1.85,100', CARD, { ordersShipped: 10 });
  assert.ok(r.lines[0].overcharge <= 100);
});

test('floating point: three-decimal rates round to the cent', () => {
  const l = one('Pick fee first unit,3,0.3335,1.0005', { ...CARD, pickFirst: 0.3333 }, { ordersShipped: 3 });
  assert.equal(l.overcharge, 0);
  const m = one('Pick fee first unit,10000,0.3335,3335', { ...CARD, pickFirst: 0.3333 }, { ordersShipped: 10000 });
  assert.equal(m.overcharge, 2);
});

test('a clean invoice reports zero recoverable and a no-differences note', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,100,1.85,185', CARD, { ordersShipped: 100 });
  assert.equal(r.totals.recoverable, 0);
  assert.match(disputeNote(r), /no differences/);
});

// ---- CSV parsing and validation

test('CSV: quoted fields, thousands separators, dollar signs and tabs', () => {
  const lines = parseInvoiceCsv('description,qty,rate,amount\n"Pallet storage, monthly","1,240",$18.00,"$22,320.00"');
  assert.deepEqual(lines[0], { description: 'Pallet storage, monthly', qty: 1240, rate: 18, amount: 22320, category: null });
  const tab = parseInvoiceCsv('Pick fee\t10\t1.85\t18.50');
  assert.equal(tab[0].amount, 18.5);
});

test('CSV: no header row means description,qty,rate,amount order', () => {
  const lines = parseInvoiceCsv('Pick fee,10,1.85,18.50\nPack,10,0.6,6');
  assert.equal(lines.length, 2);
  assert.equal(lines[1].rate, 0.6);
});

test('CSV: header aliases and column order are honoured', () => {
  const lines = parseInvoiceCsv('Total,Description,Quantity,Unit Price\n18.50,Pick fee,10,1.85');
  assert.deepEqual([lines[0].description, lines[0].qty, lines[0].rate, lines[0].amount], ['Pick fee', 10, 1.85, 18.5]);
});

test('CSV: blank rate is derived from amount and quantity; blank qty from amount and rate', () => {
  const lines = parseInvoiceCsv('description,qty,rate,amount\nPick,10,,18.50\nPack,,0.5,6');
  assert.equal(lines[0].rate, 1.85);
  assert.equal(lines[1].qty, 12);
});

test('CSV errors name the row', () => {
  assert.throws(() => parseInvoiceCsv(''), /Paste the invoice lines/);
  assert.throws(() => parseInvoiceCsv('description,qty,rate,amount\nPick,10,1.85,abc'), /row 2: amount "abc"/);
  assert.throws(() => parseInvoiceCsv('description,qty,rate,amount\n,10,1.85,18.5'), /row 2: the description is empty/);
  assert.throws(() => parseInvoiceCsv('description,qty,rate,amount\nPick,10,1.85,'), /row 2: the amount is empty/);
  assert.throws(() => parseInvoiceCsv('description,qty,rate,amount'), /no lines/);
  assert.throws(() => parseInvoiceCsv('description,qty,rate,amount\n"Pick,10,1.85,18.5'), /quote/);
  assert.throws(() => parseInvoiceCsv('description,qty,rate,amount,category\nPick,10,1.85,18.5,bogus'), /category "bogus"/);
  assert.throws(() => parseInvoiceCsv('description,qty,rate\nPick,10,1.85'), /description and amount/);
});

test('rate card and record validation', () => {
  assert.throws(() => normalizeRateCard({}), /at least one fee/);
  assert.throws(() => normalizeRateCard({ pickFirst: 'x' }), /must be a number/);
  assert.throws(() => normalizeRateCard({ pickFirst: -1 }), /negative/);
  assert.throws(() => normalizeRateCard({ pickFirst: 1, fuelSurchargePct: 150 }), /at most 100/);
  assert.throws(() => normalizeRateCard({ pickFirst: 0 }), /at least one fee/);
  assert.throws(() => normalizeRecords({ ordersShipped: -5 }), /negative/);
  assert.equal(normalizeRecords({ ordersShipped: '1,200' }).ordersShipped, 1200);
  assert.equal(normalizeRecords({}).ordersShipped, null);
});

test('auditInvoice rejects malformed pre-parsed lines', () => {
  assert.throws(() => auditInvoice({ rateCard: CARD, lines: [] }), /no lines/);
  assert.throws(() => auditInvoice({ rateCard: CARD, lines: [{ description: '', qty: 1, rate: 1, amount: 1 }] }), /description is empty/);
  assert.throws(() => auditInvoice({ rateCard: CARD, lines: [{ description: 'x', qty: 'a', rate: 1, amount: 1 }] }), /qty must be a number/);
  assert.throws(() => auditInvoice({ rateCard: CARD }), /Paste the invoice lines/);
});

test('every category points at a rate-card field and names a proving record', () => {
  for (const [id, c] of Object.entries(CATEGORIES)) {
    assert.ok(c.label && c.card && c.section && c.recordName, id);
  }
});

// ---- outputs

test('dispute note lists findings largest first with proving records and totals', () => {
  const note = disputeNote(run(CSV), { threePl: 'Acme 3PL', invoiceNumber: 'INV-1042', brand: 'Jo, Example Co' });
  assert.match(note, /^Subject: Billing dispute for invoice INV-1042: \$3,607\.80 to review/);
  assert.match(note, /Hello Acme 3PL,/);
  assert.ok(note.indexOf('"Account minimum"') < note.indexOf('"Pick fee - first unit"'));
  assert.match(note, /WMS inventory snapshots/);
  assert.match(note, /Order export/);
  assert.match(note, /Jo, Example Co$/);
  assert.doesNotMatch(note, /\b(legal|sue|lawyer|breach)\b/i);
});

test('dispute note mentions unverified categories', () => {
  const note = disputeNote(run(CSV, CARD, { ordersShipped: 3200, unitsShipped: 4900 }));
  assert.match(note, /did not check quantities for/);
});

test('CSV export has a header, ranked rows first, and neutralises formula cells', () => {
  const r = run('description,qty,rate,amount\nPick fee first unit,100,1.85,185\n"=SUM(1,2)",1,5,5', CARD, { ordersShipped: 100 });
  const csv = toCsv(r);
  const rows = csv.trim().split('\r\n');
  assert.match(rows[0], /^rank,line,description/);
  assert.match(rows[1], /^1,2,"'=SUM\(1,2\)"/);
  assert.match(csv, /total_recoverable,5/);
});

test('share state round-trips through a URL fragment, including a multi-line invoice with commas', () => {
  const values = { pickFirst: '1.85', ordersShipped: '3200', invoiceCsv: CSV, threePl: 'Acme & Sons', unknownKey: 'x' };
  const hash = encodeState(values);
  assert.ok(!hash.includes('\n'));
  const back = decodeState('#' + hash);
  assert.equal(back.pickFirst, '1.85');
  assert.equal(back.invoiceCsv, CSV);
  assert.equal(back.threePl, 'Acme & Sons');
  assert.equal(back.unknownKey, undefined);
  assert.deepEqual(decodeState(''), {});
});

test('auditFromFlat groups the flat page values', () => {
  const r = auditFromFlat({ ...CARD, ...RECORDS, invoiceCsv: CSV });
  assert.equal(r.totals.recoverable, 3607.8);
});

test('delimiter: a tab-separated paste is split on tabs, commas in descriptions kept', () => {
  const rows = parseInvoiceCsv('description\tqty\trate\tamount\nPick, each\t10\t0.5\t5');
  assert.equal(rows[0].description, 'Pick, each');
  assert.equal(rows[0].amount, 5);
});

test('delimiter: a comma header that contains a tab character stays comma-separated', () => {
  const rows = parseInvoiceCsv('"Pick\tfee",10,0.5,5');
  assert.equal(rows[0].description, 'Pick\tfee');
  assert.equal(rows[0].qty, 10);
});
