import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseParties, readWaiver, finalPapers, exceptionsText, coverEmail, toCsv, EXAMPLE, WAIVER_FORM_STATES, formPage } from "./finalpay.mjs";
import { STATES } from "./state-forms.mjs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const example = (s = {}) => finalPapers(parseParties(EXAMPLE).lines, s);

test("reads the example's columns by name", () => {
  const { lines, errors } = parseParties(EXAMPLE);
  assert.deepEqual(errors, []);
  assert.equal(lines.length, 4);
  assert.deepEqual(lines[1], { name: "Lowvolt Systems LLC", role: "Subcontractor", contract: "52000", paid: "46800", waiver: "Conditional", claim: "", note: "retainage held" });
  assert.equal(lines[3].claim, "2500");
});

test("a header without name, contract or paid is refused with the missing column named", () => {
  assert.deepEqual(parseParties("Vendor,Paid to date\nA,5").errors, ['No "contract" column found in the header row.']);
  assert.deepEqual(parseParties("").lines, []);
});

test("waiver words", () => {
  for (const s of ["Unconditional final", "unconditional", "UF", "uncond."]) assert.equal(readWaiver(s), "unconditional", s);
  for (const s of ["Conditional", "conditional final waiver", "CF"]) assert.equal(readWaiver(s), "conditional", s);
  for (const s of ["", "None", "no", "progress only", "not yet"]) assert.equal(readWaiver(s), "none", s);
  assert.equal(readWaiver("signed"), null);
});

test("the page's example, worked by hand: two exceptions, $7,700.00", () => {
  const r = example({ finalPayment: "24000" });
  assert.deepEqual(r.errors, []);
  // Valley 150,000 paid in full; Lowvolt 52,000 - 46,800 = 5,200 unpaid; Metro paid in full;
  // Ace paid in full with a 2,500 claim. Contracts 228,400, paid 223,200.
  assert.deepEqual(r.totals, { contract: 22840000, paid: 22320000, unpaid: 520000, claims: 250000, exceptions: 770000 });
  assert.deepEqual(r.exceptions.map((e) => [e.name, e.kind, e.amount]), [["Lowvolt Systems LLC", "unpaid", 520000], ["Ace Trenching", "claim", 250000]]);
  assert.equal(exceptionsText(r), "1. Lowvolt Systems LLC (Subcontractor): $5,200.00 unpaid of its $52,000.00 contract (retainage held), to be paid from the final payment.\n2. Ace Trenching (Subcontractor): claims $2,500.00 beyond the amount above (disputed extra for rock); not paid and not settled.");
  // Waivers: Metro must give an unconditional final now; Lowvolt's unconditional comes after payment.
  assert.deepEqual(r.waivers.map((w) => [w.name, w.now]), [["Valley Electric Supply", null], ["Lowvolt Systems LLC", null], ["Metro Lift Rentals", "unconditional"], ["Ace Trenching", null]]);
  assert.equal(r.findings[0].level, "high");
  assert.match(r.findings[0].text, /^Ace Trenching: an open claim of \$2,500\.00/);
  assert.ok(r.findings.some((f) => /1 final waiver to collect/.test(f.text)));
  // 24,000 - 5,200 = 18,800 left for the sub.
  assert.ok(r.findings.some((f) => f.level === "low" && /leaving \$18,800\.00 for you/.test(f.text)));
});

test("nothing unpaid and every unconditional waiver in hand: exceptions are None", () => {
  const r = finalPapers(parseParties("Name,Contract,Paid,Final waiver\nA,100,100,unconditional\nB,50.50,50.50,UF").lines, {});
  assert.equal(exceptionsText(r), "None.");
  assert.deepEqual(r.findings, []);
  assert.match(coverEmail(r), /The affidavit lists no exceptions\./);
});

test("no lower tiers at all: the package is the affidavit and your own waiver", () => {
  const r = finalPapers([], {});
  assert.equal(exceptionsText(r), "None.");
  assert.deepEqual(r.attachments.filter((a) => a.needed).map((a) => a.doc.split(" (")[0].split(",")[0]), ["Final payment affidavit", "Your own final lien waiver"]);
});

test("owing lower tiers more than the final payment is flagged, naming the shortfall", () => {
  const r = finalPapers(parseParties("Name,Contract,Paid\nA,10000,2000\nB,5000,0").lines, { finalPayment: "9,000" });
  const f = r.findings.find((x) => x.level === "high");
  assert.match(f.text, /You still owe your lower tiers \$13,000\.00, \$4,000\.00 more than the \$9,000\.00 final payment/);
});

test("an unconditional waiver from a party still unpaid is questioned, and still an exception", () => {
  const r = finalPapers(parseParties("Name,Contract,Paid,Waiver\nA,1000,900,unconditional").lines, {});
  assert.equal(r.exceptions.length, 1);
  assert.ok(r.findings.some((f) => /unconditional final waiver, but your list shows \$100\.00 still unpaid/.test(f.text)));
});

test("paid more than the contract is noted and is not a negative exception", () => {
  const r = finalPapers(parseParties("Name,Contract,Paid,Waiver\nA,1000,1200,UF").lines, {});
  assert.equal(r.totals.unpaid, 0);
  assert.ok(r.findings.some((f) => /\$200\.00 more than its contract/.test(f.text)));
});

test("bad input is refused per row", () => {
  const r = finalPapers(parseParties("Name,Contract,Paid,Waiver,Claim\n,abc,-5,signed,x").lines, { finalPayment: "lots" });
  assert.deepEqual(r.errors, [
    "The final payment must be a number, zero or more.",
    "Row 2: name is missing.",
    'Row 2: contract "abc" is not a number.',
    "Row 2: paid to date cannot be negative.",
    'Row 2: open claim "x" is not a number.',
    'Row 2: final waiver "signed" is not one of: unconditional, conditional, none.',
  ]);
});

test("a bond adds the consent of surety; a statutory-form state points to its forms page", () => {
  const r = example({ bonded: true, state: "ca" });
  assert.equal(r.attachments.find((a) => /surety/i.test(a.doc)).needed, true);
  assert.ok(r.findings.some((f) => /california-lien-waiver-forms\.html/.test(f.text)));
  assert.match(r.attachments[1].why, /California's statutory form/);
  assert.equal(example({}).attachments.find((a) => /surety/i.test(a.doc)).needed, false);
  assert.ok(!example({ state: "OH" }).findings.some((f) => /statutory/.test(f.text)));
});

test("the statutory-form states match state-forms.mjs, and each has its page", () => {
  assert.deepEqual(Object.entries(WAIVER_FORM_STATES), STATES.map(([c, n]) => [c, n]));
  for (const name of Object.values(WAIVER_FORM_STATES)) assert.ok(read(formPage(name)).length > 1000, name);
});

test("CSV keeps formula-like names inert", () => {
  const r = finalPapers(parseParties('Name,Contract,Paid\n"=HYPERLINK(1)",10,5').lines, {});
  const csv = toCsv(r);
  assert.match(csv, /^Name,Role,Contract,Paid to date,Unpaid/);
  assert.match(csv, /\n'=HYPERLINK\(1\),,10\.00,5\.00,5\.00,0\.00,none,conditional,\n/);
  assert.match(csv, /\nTotals,,10\.00,5\.00,5\.00,0\.00,,,\n$/);
});

test("the cover email lists the enclosures and the exceptions only", () => {
  const e = coverEmail(example({ bonded: true }), { project: "Clinic electrical", from: "Pat, Example Electric" });
  assert.match(e, /^Subject: Final payment documents: Clinic electrical\n/);
  assert.match(e, /- Consent of surety to final payment/);
  assert.match(e, /The affidavit lists 2 exceptions \(\$7,700\.00 in all\):/);
  assert.doesNotMatch(e, /hereby|statut|we waive|release all/i);
});

test("every phrase the page quotes from AIA's documents is in the sources file", () => {
  const html = read("final-payment-affidavit.html");
  const src = read("sources/aia-g706-family.txt").replace(/\s+/g, " ");
  const quotes = [...html.matchAll(/<q>([^<]+)<\/q>/g)].map((m) => m[1].replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " "));
  assert.ok(quotes.length >= 5, `only ${quotes.length} quotes`);
  for (const q of quotes) assert.ok(src.includes(q), q);
  for (const u of ["https://contractdocs.aia.org/PreviewFiles/Preview_G706-1994.pdf", "https://contractdocs.aia.org/PreviewFiles/Preview_G706A-1994.pdf", "https://contractdocs.aia.org/PreviewFiles/Preview_G707-1994.pdf", "https://help.aiacontracts.com/hc/en-us/articles/1500009309042"]) assert.ok(html.includes(`href="${u}"`), u);
  assert.match(html, /Not affiliated with the American Institute of Architects/);
  assert.match(html, /2026-11-28/);
});
