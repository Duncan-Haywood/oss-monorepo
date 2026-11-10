import test from "node:test";
import assert from "node:assert/strict";
import { suggest, payeeKey, trainClassifier, buildMemory, historyRecord } from "./categorize.mjs";
import { mintRows, evaluate } from "./eval/mint-labelled.mjs";

// Rows are made up in the shape of real Mint exports; the reading itself fetches public files
// at run time (eval/mint-labelled.mjs, README "Labelled bank lines from Mint exports").
const cold = (desc) => suggest({ desc, cents: -1500 }, { rules: [], codes: null, classifier: { n: 0 } }).account;

test("bank wrapper words no longer become the payee key", () => {
  assert.equal(payeeKey("PRE-AUTHORIZATION DEBIT AT DUNKIN 348029, SARASOTA, FL ON 01"), "dunkin sarasota");
  assert.equal(payeeKey("Pending DEBIT PURCHASE Jan31 10:31p 6352 AT 22:31 GRAFTON ST"), "grafton st");
  assert.notEqual(payeeKey("PRE-AUTHORIZATION DEBIT AT SHELL, SARASOTA"), payeeKey("PRE-AUTHORIZATION DEBIT AT DUNKIN, SARASOTA"));
});

test("restaurant words and Seamless's glued descriptor are meals", () => {
  for (const d of ["SEAMLSSTHEMILL", "SEAMLSS*JUSTSALADBRONEW YORK", "KING STREET GRILLE KIAWAH", "FOURTH AVENUE PUB INC",
    "FULTON STREET SOUP", "MIGHTY QUINN`S BARBEQUE", "VIVE LA CREPE - NOLITA", "52 GLOBAL KITCHEN INC", "QDOBA #0515"]) assert.equal(cold(d), "6130", d);
});

test("keyword fixes: Moe's Southwest Grill is not an airline, an Ohio tax site is not a taxi", () => {
  assert.equal(cold("MOES SOUTHWEST GRILL"), "6130");
  assert.equal(cold("SOUTHWEST AIRLINES 5262179221526"), "6120");
  assert.notEqual(cold("8052-1OHTAXITES  OHINCOMETX"), "6120");
  assert.equal(cold("YELLOW TAXI CO"), "6120");
  assert.equal(cold("KITCHEN SUPPLY DEPOT"), null);
  assert.equal(cold("BURGER KING #123"), "6130");
});

test("a city word learned elsewhere cannot overrule a keyword", () => {
  const hist = ["BROOKLYN COLLEGE DUES", "BROOKLYN MUSEUM MEMBERSHIP", "BROOKLYN LIBRARY COURSE"].map((d) => historyRecord({ desc: d, cents: -5000 }, "6170"))
    .concat(["CAFE LUNA MANHATTAN", "JOES DINER QUEENS"].map((d) => historyRecord({ desc: d, cents: -1500 }, "6130")));
  const model = { rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist) };
  assert.equal(suggest({ desc: "DEBIT PURCHASE SHAKE SHACK 1109 BROOKLYN", cents: -1500 }, model).account, "6130");
  // With no keyword the classifier still speaks.
  assert.equal(suggest({ desc: "DEBIT PURCHASE ZORBA BROOKLYN", cents: -5000 }, model).account, "6170");
});

test("Mint rows: original description, debit only scored, Category never shown", () => {
  const csv = 'Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes\n' +
    '1/05/2026,Shake Shack,"SHAKE SHACK 1109 BROOKLYN",12.50,debit,Fast Food,Card,,\n' +
    '1/20/2026,Shake Shack,"SHAKE SHACK 1109 BROOKLYN",11.00,debit,Fast Food,Card,,\n' +
    '2/02/2026,Shake Shack,"SHAKE SHACK 1109 BROOKLYN",9.00,debit,Fast Food,Card,,\n' +
    '2/03/2026,Refund,"SHAKE SHACK 1109 BROOKLYN",9.00,credit,Fast Food,Card,,\n' +
    '2/04/2026,Target,"TARGET 00012",30.00,debit,Shopping,Card,,\n';
  const rows = mintRows(csv);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], { date: "2026-01-05", desc: "SHAKE SHACK 1109 BROOKLYN", cat: "Fast Food", out: true });
  const o = evaluate(rows);
  assert.equal(o.scored, 3);
  assert.equal(o.all.right, 3);
  assert.equal(o.first.n, 1);
  assert.equal(o.bySource.memory.n, 1);
});
