// UK merchants in the built-in keywords (2026-11-15; README "UK merchants in the built-in
// keywords"). Descriptions in the shapes UK card reports print; amounts made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest, buildMemory } from "./categorize.mjs";
import { CLASS_MAP, loadDir } from "./eval/southlakeland-pcard.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cold = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null };
const s = (desc, cents = -2500) => suggest({ desc, cents }, cold).account;

test("UK rail, coach, hotels and airlines are travel", () => {
  for (const d of ["Trainline", "THETRAINLINE.COM", "The Train Line", "Virgin Trains", "Northern Rail", "LNER", "Avanti West Coast",
    "TransPennine Express", "GWR TICKET OFFICE", "ScotRail", "Eurostar", "National Express", "Travelodge", "Travellodge", "RYANAIR", "easyJet", "Jet2.com", "British Airways"])
    assert.equal(s(d), "6120", d);
});

test("UK grocers are meals, their filling stations are fuel", () => {
  for (const d of ["TESCO STORES 6329", "Sainsbury's", "SAINSBURYS S/MKTS", "ASDA STORES", "WM MORRISONS STORE", "Waitrose", "LIDL GB", "EH Booths", "ICELAND FOODS", "Greggs", "Pret A Manger", "Nando's", "JD Wetherspoon"])
    assert.equal(s(d), "6130", d);
  for (const d of ["TESCO PFS 4088", "TESCO PAY AT PUMP 4088", "ASDA PETROL 5115", "SAINSBURYS PETROL", "MORRISONS FUEL", "DVLA VEHICLE TAX"])
    assert.equal(s(d), "6160", d);
  assert.equal(s("ASDA GEORGE COM LEEDS"), "6100");
});

test("UK trade suppliers, stationers, post and professional bodies", () => {
  for (const d of ["SCREWFIX DIRECT", "Toolstation", "TRAVIS PERKINS", "Jewson", "WICKES", "B&Q", "B & Q", "CURRYS ONLINE", "RS COMPONENTS"]) assert.equal(s(d), "6100", d);
  for (const d of ["Rymans", "WH Smith", "W H SMITHS", "Viking Direct", "ROYAL MAIL GROUP LTD"]) assert.equal(s(d), "6070", d);
  for (const d of ["Parcelforce", "Evri", "Yodel"]) assert.equal(s(d), "6180", d);
  for (const d of ["CIPFA", "CIEH", "IRRV", "CIPD", "AAT", "RICS SUBS", "Chartered Institute of Payroll Professionals", "Chart Inst of Payroll Prof"]) assert.equal(s(d), "6170", d);
  assert.equal(s("Companies House"), "6110");
  assert.equal(s("MONEYCLAIM.GOV"), "6050");
  for (const d of ["E.ON NEXT", "British Gas"]) assert.equal(s(d), "6140", d);
});

test("ambiguous UK names stay for review", () => {
  // General stores (as Walmart and Target), HMRC (usually VAT or PAYE owed), Iceland the country,
  // and stalls or booth rent are not filed by a keyword.
  for (const d of ["ARGOS", "HOME BARGAINS", "POUNDLAND", "Marks & Spencer", "HMRC VAT", "ICELAND TRAVEL - ISK", "Icelandair", "HALFORDS 0550", "NCP LIMITED", "DVSA"])
    assert.equal(s(d), null, d);
  assert.notEqual(s("Salon booth rent"), "6130");
  assert.notEqual(s("Photo booth hire"), "6130");
});

test("the South Lakeland reader keeps only mapped classes, the supplier only, charges negative", () => {
  const dir = mkdtempSync(join(tmpdir(), "sl-"));
  writeFileSync(join(dir, "a.csv"), [
    "OrganisationNameLabel,OrganisationURI,EffectiveDate,PaymentDate,Directorate/ServiceWhereExpenditureIncurred,ServiceCategoryLabel,ServiceCategoryURI,Supplier,NetAmount,IrrecoverableVAT,PurposeOfExpenditure,ProcurementClassification:ProclassLabel,ProcrementClassification:ProClassCode",
    "Council,x,12/02/2020,01/11/2019,Plans,Central,x,Example Rail,84.70,0.00,Train to a meeting,Public Transport,360000",
    "Council,x,12/02/2020,02/11/2019,Plans,Central,x,Example Shop,11.95,0.00,Biscuits,Not Elsewhere Classified,999999",
    "Council,x,12/02/2020,03/11/2019,Plans,Central,x,Example Rail,-84.70,0.00,Refund,Public Transport,360000",
    ",,,,,,,,,,,,",
  ].join("\r\n"));
  const { rows, stats } = loadDir(dir);
  assert.deepEqual(rows.map((r) => [r.desc, r.date, r.cents, r.want]), [["Example Rail", "2019-11-01", -8470, ["6120"]]]);
  assert.equal(stats.refunds, 1);
  assert.equal(stats.classed, 3);
  assert.ok(CLASS_MAP.get("training & conferences").includes("6170"));
});
