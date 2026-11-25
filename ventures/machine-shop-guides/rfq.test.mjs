import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readRfq, findQuantities, findTolerances, reviewCsv, draftEmail, breaksFor, CLAUSES } from "./rfq.mjs";

// Invented RFQs written for these tests, in the shapes buyers send. No real
// company, part or contract.
const DEFENSE = `Hello,

Please quote the following. Quotes due by 12/10/2026.
Delivery: 6 weeks ARO. This is a DO-A1 rated order.

P/N 7781-204 Rev C
Qty: 10, 25, 50
Material: 6061-T6 aluminum per AMS-QQ-A-250/11
Anodize per MIL-PRF-8625 Type II Class 2, black
Bore ±.0005, all other ±.005. 32 Ra on sealing face.

P/N 7781-210 Rev B
50 pcs, EAU 400
17-4 PH H1150, passivate
±0.01 mm on the pilot diameter

Requirements: AS9102 first article on first lot, material certs and C of C with each shipment.
Clauses: FAR 52.204-21, DFARS 252.204-7012, 252.225-7009, 252.204-7021, 52.246-11 (AS9100D), 252.211-7003.
Drawings are ITAR controlled and marked CUI; attached as PDF and STEP.
`;

const TERSE = `need price on 100 of the attached bracket asap. thanks`;

test("finds every part, revision, quantity and annual usage", () => {
  const r = readRfq(DEFENSE);
  assert.deepEqual(r.lines.map((l) => l.partNumber), ["7781-204", "7781-210"]);
  assert.deepEqual(r.lines.map((l) => l.revision?.text), ["C", "B"]);
  assert.deepEqual(r.lines[0].quantities, [10, 25, 50]);
  assert.deepEqual(r.lines[1].quantities, [50]);
  assert.equal(r.lines[1].annual.quantity, 400);
  assert.deepEqual(breaksFor(r), [10, 25, 50]);
});

test("finds material, finish, specs and dates", () => {
  const r = readRfq(DEFENSE);
  assert.match(r.lines[0].material.text, /6061-T6/);
  assert.match(r.lines[1].material.text, /17-4 PH/);
  assert.deepEqual(r.lines[0].finishes.map((f) => f.label), ["anodize"]);
  assert.deepEqual(r.lines[1].finishes.map((f) => f.label), ["passivation"]);
  const specs = r.specs.map((s) => s.spec);
  for (const s of ["MIL-PRF-8625", "AS9102", "AS9100D"]) assert.ok(specs.includes(s), s);
  assert.equal(r.delivery.text, "6 weeks ARO");
  assert.equal(r.quoteDue.text, "12/10/2026");
  assert.ok(r.drawing);
});

test("tolerances are read in inches, mm converted, and tight ones flagged", () => {
  const r = readRfq(DEFENSE);
  assert.deepEqual(r.lines[0].tolerances.map((t) => [t.inches, t.tight]), [[0.0005, true], [0.005, false]]);
  const mm = r.lines[1].tolerances[0];
  assert.ok(Math.abs(mm.inches - 0.01 / 25.4) < 1e-12);
  assert.ok(mm.tight);
  assert.equal(r.tightCount, 2);
  assert.equal(r.lines[0].surface[0].text, "32 Ra");
  // The shop's own line moves the flag.
  assert.equal(readRfq(DEFENSE, { tightInches: 0.0001 }).tightCount, 0);
});

test("clauses: known ones get their title, unknown ones are listed to look up", () => {
  const r = readRfq(DEFENSE);
  assert.deepEqual(r.clauses.map((c) => c.id).sort(), ["252.204-7012", "252.204-7021", "252.225-7009", "52.204-21", "52.246-11"].sort());
  assert.deepEqual(r.otherClauses.map((c) => c.id), ["252.211-7003"]);
  const ids = r.requirements.map((x) => x.id);
  for (const id of ["cui", "export", "fai", "certs", "coc", "quality", "dpas"]) assert.ok(ids.includes(id), id);
});

test("clause numbers inside a longer number are not matched", () => {
  const r = readRfq("Ref 1252.204-70123 and 52.204-210 only.");
  assert.equal(r.clauses.length, 0);
});

test("questions ask for what the RFQ left out, and about what it flagged", () => {
  const r = readRfq(DEFENSE);
  const q = r.questions.join("\n");
  assert.match(q, /CUI/);
  assert.match(q, /ITAR- or EAR-controlled/);
  assert.match(q, /melt origin/);
  assert.match(q, /AS9102/);
  assert.match(q, /DPAS/);
  assert.match(q, /±0\.00039"/);
  // Delivery, quote date, drawing, revision and material were all given.
  assert.doesNotMatch(q, /When do you need the parts|When do you need the quote|send the drawing|Which drawing revision|What material/);
  // The anodize line already names its type and class, so no question about it.
  assert.doesNotMatch(q, /Which anodize type/);
  // A spec with no type still gets the question.
  assert.match(readRfq("P/N 1001-A Rev C qty 5 6061-T6, anodize per MIL-PRF-8625, black").questions.join("\n"), /Which anodize type/);
});

test("a terse email becomes a full set of questions", () => {
  const r = readRfq(TERSE);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].partNumber, null);
  assert.deepEqual(r.lines[0].quantities, [100]);
  assert.equal(r.delivery, null);
  const q = r.questions.join("\n");
  for (const re of [/Which part number/, /What material/, /send the drawing/, /When do you need the parts/, /one-time buy/]) assert.match(q, re);
});

test("quantity reader: lists, parentheses and pieces; tolerances and sizes are not quantities", () => {
  assert.deepEqual(findQuantities("QTY 5/10/25").quantities, [5, 10, 25]);
  assert.deepEqual(findQuantities("quantities of 5, 10 and 25").quantities, [5, 10, 25]);
  assert.deepEqual(findQuantities("(12) pieces please").quantities, [12]);
  assert.deepEqual(findQuantities("1,000 pcs").quantities, [1000]);
  assert.deepEqual(findQuantities("bore 0.500 ±.001, 2.25 long").quantities, []);
  assert.equal(findQuantities("annual usage: 2,400").annual.quantity, 2400);
});

test("tolerance reader handles +/- and plus or minus", () => {
  const t = findTolerances("+/- .002 and plus or minus 0.1 mm and ±0.5 thou", 0.001).tolerances;
  assert.deepEqual(t.map((x) => Number(x.inches.toFixed(6))), [0.002, 0.003937, 0.0005]);
});

test("CSV keeps evidence, neutralises formula cells, and the email lists every question", () => {
  const r = readRfq(DEFENSE);
  const csv = reviewCsv(r);
  assert.match(csv.split("\n")[0], /^section,part,item,value,evidence$/);
  assert.match(csv, /DFARS 252\.204-7012,Safeguarding Covered Defense Information and Cyber Incident Reporting/);
  const evil = reviewCsv(readRfq("P/N =HYPERLINK(1) Rev A\nmaterial: =cmd|' /C calc'!A0"));
  assert.doesNotMatch(evil, /(^|,)=cmd/m);
  const mail = draftEmail(r, { shop: "Shop", buyer: "Pat" });
  assert.match(mail, /^Subject: Questions before we quote: 7781-204, 7781-210/);
  for (const [i] of r.questions.entries()) assert.match(mail, new RegExp(`^${i + 1}\\. `, "m"));
});

test("huge or odd input does not throw", () => {
  assert.doesNotThrow(() => readRfq(null));
  assert.doesNotThrow(() => readRfq("P/N ".repeat(50000)));
  assert.doesNotThrow(() => readRfq("±".repeat(10000) + "Qty: " + "9,".repeat(10000)));
});

// Clause titles copied from GSA's FAR/DFARS .dita sources (SOURCES.md).
test("clause titles are pinned to the GSA source text", () => {
  const titles = CLAUSES.map((c) => `${c.id} ${c.title}`).join("\n");
  const hash = createHash("sha256").update(titles).digest("hex");
  const sources = readFileSync(new URL("./SOURCES.md", import.meta.url), "utf8");
  assert.ok(sources.includes(hash.slice(0, 16)), `SOURCES.md should name the clause title hash ${hash.slice(0, 16)}`);
});

test("long digit and comma runs stay linear (no regex backtracking blow-up)", () => {
  for (const s of ["+/- " + "1".repeat(20000) + ".", "Ra " + "9".repeat(20000) + "x", "1".repeat(100000), "1,".repeat(50000), "qty " + "(1) pcs , ".repeat(5000)]) {
    const t = Date.now();
    readRfq(s);
    assert.ok(Date.now() - t < 1000, `took ${Date.now() - t} ms on a ${s.length}-char input`);
  }
});
