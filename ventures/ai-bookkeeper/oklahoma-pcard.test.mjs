// Oklahoma's purchasing-card reports (eval/oklahoma-pcard.mjs): made-up rows under
// the real headers, the network category names the files print, and the keyword
// misfiles found on them.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";
import { mccFromName, mccAccount } from "./mcc.mjs";
import { suggest } from "./categorize.mjs";
import { plainRead } from "./eval/oklahoma-pcard.mjs";

const COUNTY = "CALENDAY_YEAR,CALENDAR_MONTH,Business Unit,LAST_NAME,FIRST_INITIAL,Item Description, Amount ,MERCHANT,TRANSACTION_DATE,POST_DATE,MCC_DESCRPTION,,\n";
const rows = [
  "2024,1,EXAMPLE COUNTY,Doe,J,Passenger Leg,$425.60 ,AMERICAN AIR0012100000001,1/3/2024,1/4/2024,AMERICAN AIRLINES,,",
  "2024,1,EXAMPLE COUNTY,Doe,J,GENERAL PURCHASE,$38.12 ,WAL-MART #0001,1/5/2024,1/6/2024,DISCOUNT STORES,,",
  "2024,1,EXAMPLE COUNTY,Roe,A,GENERAL PURCHASE,($12.00),WAL-MART #0001,1/9/2024,1/10/2024,DISCOUNT STORES,,",
  "2024,1,EXAMPLE COUNTY,Roe,A,GENERAL PURCHASE,\"$1,204.50 \",HOLIDAY INN EXAMPLE,1/9/2024,1/10/2024,HOLIDAY INNS,,",
  "2024,1,EXAMPLE COUNTY,Roe,A,GENERAL PURCHASE,$61.00 ,EXAMPLE FEED STORE,1/11/2024,1/12/2024,AGRICULTURAL COOPERATIVES,,",
  ",,,,,,,,,,,,",
];
const CENTS = [-42560, -3812, 1200, -120450, -6100];

test("county report: the misspelled MCC_DESCRPTION header is the merchant category, so charges are money out", () => {
  const got = readStatement(COUNTY + rows.join("\n") + "\n");
  assert.equal(got.rows.length, 5);
  assert.deepEqual(got.rows.map((r) => r.cents), CENTS);
  assert.deepEqual(got.rows.map((r) => r.mcc), ["AMERICAN AIRLINES", "DISCOUNT STORES", "DISCOUNT STORES", "HOLIDAY INNS", "AGRICULTURAL COOPERATIVES"]);
  assert.equal(got.rows[0].desc, "AMERICAN AIR0012100000001");
  assert.match(got.inferred ?? "", /signs flipped/);
});

test("county report with old Mac line ends (CR only) reads the same", () => {
  const got = readStatement((COUNTY + rows.join("\n") + "\n").replace(/\n/g, "\r"));
  assert.deepEqual(got.rows.map((r) => r.cents), CENTS);
});

test("the eval's plain reading agrees with the importer on the same rows", () => {
  const text = COUNTY + rows.join("\n") + "\n";
  const plain = plainRead(text);
  const got = readStatement(text).rows;
  assert.equal(plain.n, got.length);
  assert.equal(plain.cents, -got.reduce((a, r) => a + r.cents, 0));
  assert.equal(plain.withCat, 5);
});

test("state report layout: Merchant Name, MCC Description cut to 40 characters", () => {
  const text = "Source Year/Month,Source Type,Cardholder Last Name,Cardholder First Name,Item Description,Amount,Business Unit,Merchant Name,Transaction Date,Posted Date,MCC Description\n"
    + '201607,BANK,DOE,JANE,GENERAL PURCHASE,218.00,98000,"EXAMPLE PRINTING INC",07/28/2016,07/29/2016,"MISCELLANEOUS PUBLISHING & PRINTING"\n'
    + '201607,BANK,DOE,JANE,MARKERS,70.41,98000,"STAPLES",07/28/2016,07/29/2016,"STATIONERY,OFFICE SUPPLIES,PRINTING AND"\n'
    + '201607,BANK,DOE,JANE,TONER,112.30,98000,"STAPLES",07/28/2016,07/29/2016,"STATIONERY,OFFICE SUPPLIES,PRINTING AND"\n'
    + '201607,BANK,DOE,JANE,LUNCH,14.25,98000,"EXAMPLE DINER",07/28/2016,07/29/2016,"EATING PLACES, RESTAURANTS"\n'
    + '201607,BANK,DOE,JANE,CREDIT,-30.79,98000,"STAPLES",07/29/2016,07/30/2016,"STATIONERY,OFFICE SUPPLIES,PRINTING AND"\n';
  const got = readStatement(text).rows;
  assert.deepEqual(got.map((r) => r.cents), [-21800, -7041, -11230, -1425, 3079]);
  assert.equal(mccAccount(got[1].mcc)?.account, "6070");
});

test("network names that were missed: stems, plurals and the 3000-3999 chain names", () => {
  const want = {
    "HOLIDAY INNS": "6120", "COMFORT INNS": "6120", "EMBASSY SUITES": "6120", "LA QUINTA MOTOR INNS": "6120", "WYNDHAM": "6120",
    "DELTA": "6120", "LUFTHANSA": "6120", "BRITSH AIRWAYS - BRITISH A": "6120", "AIR CANADA - AIR CAN": "6120", "HERTZ CORPORATION": "6120",
    "TRAVEL AGENCIES": "6120", "TOLLS, ROAD AND BRIDGE FEES": "6160", "LANDSCAPE AND HORTICULTURAL SERVICES": "6090",
    "DISINFECTING AND EXTERMINATING SERVICES": "6090", "VETERINARY SERVICES": "6100",
  };
  for (const [name, account] of Object.entries(want)) assert.equal(mccFromName(name)?.account, account, name);
  // catch-alls still say nothing
  for (const name of ["GROCERY STORES, SUPERMARKETS", "BUSINESS SERVICES NOT ELSEWHERE CLASSIFI", "DISCOUNT STORES", "GOVERNMENT SERVICES NOT ELSEWHERE CLASSI"]) assert.equal(mccFromName(name), null, name);
});

test("keyword misfiles found on the state's card lines", () => {
  const s = (desc) => suggest({ desc, cents: -1000 }, { rules: [], codes: null })?.account ?? null;
  assert.equal(s("CBI WHOLESALE ELECTRIC"), "6100");
  assert.equal(s("WHITE ELECTRICAL SUPPLY"), "6100");
  assert.equal(s("IN ELITE ELECTRICAL CONT"), "6090");
  assert.equal(s("OKLAHOMA GAS & ELECTRIC"), "6140");
  assert.notEqual(s("BRENNTAG SOUTHWEST"), "6120");
  assert.notEqual(s("SOUTHWEST PARK AND REC"), "6120");
  assert.equal(s("SOUTHWEST AIRLINES 5262179221526"), "6120");
  assert.equal(s("SOUTHWEST 5262179221526"), "6120");
  assert.equal(s("Southwest"), "6120");
  assert.notEqual(s("XEROX CORPORATION/RBO"), "6060");
  assert.equal(s("XERO AU INV-12345"), "6060");
  assert.notEqual(s("DOMINO EQUIPMENT"), "6130");
  assert.equal(s("DOMINO'S 6534"), "6130");
  assert.equal(s("HERTZ EQUIPMENT"), "6080");
  assert.equal(s("HERTZ RENT-A-CAR"), "6120");
  assert.equal(s("PHILLIPS 66 - CRUISE AVIA"), "6160");
  assert.equal(s("FEDEXOFFICE 00001248"), "6070");
  assert.equal(s("FEDEX 123456789"), "6180");
  assert.notEqual(s("SPECTRUM PAINT #7"), "6140");
  assert.notEqual(s("PIKEPASS REBILLS"), "6140");
  assert.equal(s("SPECTRUM MOBILE"), "6140");
});
