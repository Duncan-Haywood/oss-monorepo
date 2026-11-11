import test from "node:test";
import assert from "node:assert/strict";
import { mccAccount, mccFromName, mccKey, normaliseMccName, MCC_RANGES } from "./mcc.mjs";
import { suggest, buildMemory, buildMccMemory, trainClassifier, trainNewPayee, historyRecord } from "./categorize.mjs";
import { readStatement } from "./bank.mjs";
import { wantFor } from "./eval/scotgov-card.mjs";

test("codes map to one account; catch-all codes say nothing", () => {
  assert.equal(mccAccount("4121").account, "6120");
  assert.equal(mccAccount("5812").account, "6130");
  assert.equal(mccAccount("5541").account, "6160");
  assert.equal(mccAccount("3650").account, "6120"); // a hotel chain's own code
  assert.equal(mccAccount("0742").account, "6100");
  assert.equal(mccAccount("5812 Eating places").code, "5812");
  for (const c of ["5999", "7399", "5311", "5969", "5964", "9399", "5045", "8999", "2741", "6011"]) assert.equal(mccAccount(c), null, c);
  assert.equal(mccAccount("7399 Business services"), null, "a catch-all code is not rescued by its name");
  assert.equal(mccAccount(""), null);
  assert.equal(mccAccount("12345"), null);
});

test("ranges do not overlap", () => {
  const r = MCC_RANGES.slice().sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < r.length; i++) assert.ok(r[i][0] > r[i - 1][1], `${r[i - 1][0]}-${r[i - 1][1]} overlaps ${r[i][0]}`);
});

test("network category names in their many spellings", () => {
  const cases = [
    ["Eating places, restaurants", "6130"],
    ["Lodging-Hotels,Motels,Resorts-Not Classified", "6120"],
    ["TRANSPRTN-SUBRBN & LOCAL COMTR PSNGR, INCL FERRIES", "6120"],
    ["Schools & Educational Svc-Not Elsewhere Classified", "6170"],
    ["Organisations, membership - not elsewhere classified", "6170"],
    ["Comp programing,data prcsng,intgrtd sys dsgn srvs", "6060"],
    ["Computer Software Stores", "6060"],
    ["Office, school supply & stationery stores", "6070"],
    ["Automotive service shops", "6160"],
    ["Insurance Sales,Underwriting,And Premiums", "6030"],
    ["Dental/Lab/Med/Ophthalmic Hosp Equip & Supplies", "6100"],
    ["Hilton", "6120"],
  ];
  for (const [name, want] of cases) assert.equal(mccFromName(name)?.account, want, name);
  for (const name of ["Business Services-Not Elsewhere Classified", "Miscellaneous And Specialty Retail Stores", "Direct Marketing-Other Direct Marketers/Not Elsew.", "Government Services-Not Elsewhere Classified", "Computers, Computer Peripheral Equipment, Software", "Professional services - not elsewhere classified", "Supermarkets"]) assert.equal(mccFromName(name), null, name);
  assert.equal(normaliseMccName("Business services-not elsewhere classified"), normaliseMccName("Business Services - Not Elsewhere Classified"));
  assert.equal(mccKey("05812"), "5812");
  assert.equal(mccKey("Eating Places, Restaurants"), mccKey("eating places restaurants"));
});

test("the statement reader keeps an MCC column, code or name", () => {
  const a = readStatement(["Date,Description,Amount,MCC", "2024-01-03,UBER TRIP 8YZ,-22.88,4121", "2024-01-04,NEW CAFE LTD,-9.50,5814"].join("\n"));
  assert.deepEqual(a.rows.map((r) => [r.desc, r.mcc]), [["UBER TRIP 8YZ", "4121"], ["NEW CAFE LTD", "5814"]]);
  const b = readStatement(["Posting Date,Merchant Name,Merchant Category Code (MCC),Amount", "2024-02-01,ACME TOOLS,5251,-120.00"].join("\n"));
  assert.equal(b.rows[0].mcc, "5251");
  const c = readStatement(["Date,Description,Amount,Merchant Category Name", "2024-02-01,Joe's Diner,-30.00,\"Eating places, restaurants\""].join("\n"));
  assert.equal(c.rows[0].mcc, "Eating places, restaurants");
  const d = readStatement(["Date,Description,Amount", "2024-02-01,Joe's Diner,-30.00"].join("\n"));
  assert.equal(d.rows[0].mcc, undefined);
});

const empty = () => ({ rules: [], codes: null, memory: buildMemory([]), classifier: trainClassifier([]), newPayee: trainNewPayee([]), mccMemory: buildMccMemory([]) });
const modelFrom = (hist) => ({ rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist), newPayee: trainNewPayee(hist), mccMemory: buildMccMemory(hist) });

test("a new payee with a code gets the table's account, for review only", () => {
  const s = suggest({ desc: "KAFE ROMASHKA 0012", cents: -3500, mcc: "5812" }, empty());
  assert.equal(s.source, "mcc");
  assert.equal(s.account, "6130");
  assert.ok(s.confidence < 0.85, "below the auto-post line, and only rules and memory post anyway");
  assert.match(s.reason, /5812/);
  assert.equal(suggest({ desc: "KAFE ROMASHKA 0012", cents: 3500, mcc: "5812" }, empty()).source === "mcc", false, "money in is not read");
  assert.notEqual(suggest({ desc: "KAFE ROMASHKA 0012", cents: -3500, mcc: "5812" }, { ...empty(), skip: new Set(["mcc"]) }).source, "mcc");
  const codes = { ...empty(), codes: new Set(["6120"]) };
  assert.notEqual(suggest({ desc: "KAFE ROMASHKA 0012", cents: -3500, mcc: "5812" }, codes).account, "6130", "never an account the chart lacks");
});

test("these books' own filings for a category win over the table after three lines", () => {
  const hist = ["CONF ONE", "SUMMIT TWO", "EXPO THREE"].map((desc) => historyRecord({ desc, cents: -50000, mcc: "7392" }, "6170"));
  assert.equal(hist[0].mcc, "7392");
  const s = suggest({ desc: "BRAND NEW EVENTS LTD", cents: -60000, mcc: "7392" }, modelFrom(hist));
  assert.equal(s.source, "mcc");
  assert.equal(s.account, "6170");
  assert.match(s.reason, /3 of 3 earlier lines/);
  assert.equal(suggest({ desc: "BRAND NEW EVENTS LTD", cents: -60000, mcc: "7392" }, modelFrom(hist.slice(0, 2))).account, "6050", "two lines: the table still speaks");
  const split = [...hist.slice(0, 2), ...["A ADVISORY", "B ADVISORY"].map((desc) => historyRecord({ desc, cents: -50000, mcc: "7392" }, "6050")), historyRecord({ desc: "C LAW", cents: -50000, mcc: "7392" }, "6110")];
  assert.notEqual(suggest({ desc: "BRAND NEW EVENTS LTD", cents: -60000, mcc: "7392" }, modelFrom(split)).source, "mcc", "no majority: nothing from this layer");
});

test("payee memory still comes first", () => {
  const hist = [historyRecord({ desc: "JOES DINER", cents: -3000, mcc: "5812" }, "6170")];
  const s = suggest({ desc: "JOES DINER", cents: -3000, mcc: "5812" }, modelFrom(hist));
  assert.equal(s.source, "memory");
  assert.equal(s.account, "6170");
});

test("eval label map: every alternative must name an account", () => {
  assert.deepEqual(wantFor("Catering"), ["6130"]);
  assert.deepEqual(wantFor("Specialist softwares OR Specialist software - renewal"), ["6060"]);
  assert.equal(wantFor("Not specified in data source"), null);
  assert.equal(wantFor("Catering OR External support services"), null);
});
