import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, ROLES, OBLIGATIONS, classify, responsible, compute, daysUntil, SAMPLE, summaryText, timelineCsv } from "./calc.mjs";

const cat = (id) => CATEGORIES.find((c) => c.id === id);
const role = (id) => ROLES.find((r) => r.id === id);
const run = (o) => compute({ ...SAMPLE, today: "2026-10-13", ...o });
const ids = (r) => r.timeline.map((t) => t.id);

test("batteries sold into the EU are in scope; military, space, none are not", () => {
  assert.equal(classify({ category: cat("ev"), sellsEu: "yes" }).status, "in");
  assert.equal(classify({ category: cat("exempt"), sellsEu: "yes" }).status, "out");
  assert.equal(classify({ category: cat("none"), sellsEu: "yes" }).status, "out");
  assert.equal(classify({ category: cat("ev"), sellsEu: "no" }).status, "out");
});

test("daysUntil counts calendar days", () => {
  assert.equal(daysUntil("2027-02-18", "2026-10-13"), 128);
  assert.equal(daysUntil("2026-08-18", "2026-10-13"), -56);
});

test("an e-bike battery gets passport, QR, removability and label; not recycled content", () => {
  const r = run({ category: "lmt", role: "manufacturer", location: "eu" });
  for (const id of ["label", "passport", "qr", "removable", "carbon"]) assert.ok(ids(r).includes(id), id);
  assert.ok(!ids(r).includes("recycled"));
});

test("a portable battery gets no passport but does get the QR code (Art 13(6) covers all batteries)", () => {
  const r = run({ category: "portable", role: "manufacturer", location: "eu" });
  assert.ok(!ids(r).includes("passport"));
  assert.equal(r.timeline.find((t) => t.id === "qr")?.from, "2027-02-18");
  assert.ok(ids(r).includes("removable"));
});

test("due diligence follows the Art 47 EUR 40m turnover test, not SME status, and sorts by date", () => {
  assert.ok(!ids(run({ under40m: "yes" })).includes("diligence"));
  assert.ok(ids(run({ under40m: "unsure" })).includes("diligence"), "an unsure answer must not hide the duty");
  assert.ok(ids(compute({ category: "lmt", role: "importer", location: "eu", today: "2026-10-13" })).includes("diligence"), "default is not exempt");
  const big = run({ under40m: "no" });
  assert.ok(ids(big).includes("diligence"));
  const dated = big.timeline.filter((t) => t.from).map((t) => t.from);
  assert.deepEqual(dated, [...dated].sort());
});

test("state follows the reference date", () => {
  const r = run({ category: "ev", role: "manufacturer", location: "eu" });
  const by = Object.fromEntries(r.timeline.map((t) => [t.id, t.state]));
  assert.equal(by.substances, "applies");
  assert.equal(by.label, "applies");
  assert.equal(by.passport, "soon");
  assert.equal(by.recycled, "later");
  assert.equal(by.carbon, "pending");
  assert.equal(run({ category: "ev", role: "manufacturer", location: "eu", today: "2027-03-01" }).timeline.find((t) => t.id === "passport").state, "applies");
});

test("marking a duty done removes it from the open list", () => {
  const before = run({ conformity: "" });
  const after = run({ conformity: "1" });
  assert.ok(before.open.some((t) => t.id === "conformity"));
  assert.ok(!after.open.some((t) => t.id === "conformity"));
});

test("operator gap for a non-EU seller", () => {
  assert.equal(responsible({ role: role("importer"), location: "noneu", euOperator: "no" }).status, "gap");
  assert.equal(responsible({ role: role("distance"), location: "noneu", euOperator: "unsure" }).status, "unknown");
  assert.equal(responsible({ role: role("distance"), location: "noneu", euOperator: "yes" }).status, "covered");
  assert.equal(responsible({ role: role("manufacturer"), location: "eu", euOperator: "no" }).status, "self");
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({}).errors.length >= 3);
  assert.ok(run({ today: "13/10/2026" }).errors[0].includes("YYYY-MM-DD"));
  assert.ok(run({ today: "2026-13-45" }).errors);
});

test("out of scope result has no timeline", () => {
  const r = run({ category: "exempt" });
  assert.equal(r.timeline.length, 0);
  assert.equal(r.findings[0].severity, "info");
});

test("summary and CSV render the timeline", () => {
  const r = run({});
  const s = summaryText(r);
  assert.match(s, /Timeline:/);
  assert.match(s, /not legal advice/);
  const csv = timelineCsv(r).split("\n");
  assert.equal(csv.length, r.timeline.length + 1);
  assert.match(csv[0], /applies_from/);
});

test("sample runs and flags overdue duties as high", () => {
  const r = run({});
  assert.ok(r.overdue.length > 0);
  assert.equal(r.findings[0].severity, "high");
});

test("the QR code has its own done mark, separate from the passport", () => {
  const r = run({ category: "ev", role: "manufacturer", location: "eu", passport: "1" });
  assert.equal(r.timeline.find((t) => t.id === "passport").done, true);
  assert.equal(r.timeline.find((t) => t.id === "qr").done, false);
});

// Every date and scope below was read from the Official Journal text of Regulation (EU) 2023/1542
// (and 2025/1561 for due diligence) on 2026-11-15, not from this tool's own table.
const REGULATION_DATES = {
  substances: "2024-02-18", // Art 96(2): applies from 18 Feb 2024 (Art 6, Annex I)
  conformity: "2024-08-18", // Art 96(2)(b): Art 17 and Chapter VI from 18 Aug 2024
  handling: "2024-08-18", // Art 43 sits in Chapter VI
  epr: "2025-08-18", // Art 96(2)(c): Chapter VIII from 18 Aug 2025
  "epr-first": "2025-08-18",
  collection: "2025-08-18", // Art 13(4)
  label: "2026-08-18", // Art 13(1)
  removable: "2027-02-18", // Art 96(2)(a)
  qr: "2027-02-18", // Art 13(6)
  passport: "2027-02-18", // Art 77
  diligence: "2027-08-18", // Art 48(1) as amended by Regulation (EU) 2025/1561
  recycled: "2028-08-18", // Art 8(1)
  carbon: null, // Art 7: waits on delegated and implementing acts
};

test("every duty's start date matches the Regulation's text", () => {
  for (const o of OBLIGATIONS) {
    if (o.id === "operator") continue; // a Regulation (EU) 2019/1020 duty, checked below
    assert.ok(o.id in REGULATION_DATES, `no source date for ${o.id}`);
    assert.equal(o.from, REGULATION_DATES[o.id], o.id);
  }
});

test("category sets follow the Regulation: QR for all, passport and recycled content for named categories", () => {
  const cats = (id) => [...OBLIGATIONS.find((o) => o.id === id).categories].sort();
  const all = ["ev", "industrial-big", "industrial-small", "lmt", "portable", "sli"];
  assert.deepEqual(cats("qr"), all); // Art 13(6) "all batteries"
  assert.deepEqual(cats("collection"), all); // Art 13(4) "all batteries"
  assert.deepEqual(cats("passport"), ["ev", "industrial-big", "lmt"]); // Art 77(1)
  assert.deepEqual(cats("recycled"), ["ev", "industrial-big", "sli"]); // Art 8(1)
  assert.deepEqual(cats("removable"), ["lmt", "portable"]); // Art 11
});

test("an EU fulfilment provider with no EU operator named is the responsible operator, not 'all done'", () => {
  const r = run({ category: "portable", role: "fulfilment", location: "eu", euOperator: "no" });
  assert.equal(r.responsible.status, "fallback");
  assert.ok(ids(r).includes("operator") && ids(r).includes("handling"));
  assert.ok(r.findings.some((f) => f.severity === "high" && /responsible economic operator/.test(f.title)));
  assert.ok(!r.findings.some((f) => /Every duty listed/.test(f.title)));
});

test("an EU fulfilment provider behind a named EU operator keeps the Art 43 handling duty only", () => {
  const r = run({ category: "portable", role: "fulfilment", location: "eu", euOperator: "yes" });
  assert.equal(r.responsible.status, "covered");
  assert.deepEqual(ids(r), ["handling"]);
  assert.equal(responsible({ role: role("fulfilment"), location: "eu", euOperator: "unsure" }).status, "unknown");
});

test("'every duty is marked done' needs at least one duty", () => {
  const r = run({ category: "portable", role: "fulfilment", location: "eu", euOperator: "yes", handling: "1" });
  assert.ok(r.findings.some((f) => /Every duty listed/.test(f.title)));
});

test("a distributor sees producer registration (Art 3(47)(c), Art 55)", () => {
  const r = run({ category: "portable", role: "distributor", location: "eu", euOperator: "yes" });
  assert.ok(ids(r).includes("epr-first"));
});

test("nuclear-safety equipment is not offered as out of scope (Art 1(6) disapplies only Chapters III and VIII)", () => {
  assert.doesNotMatch(cat("exempt").label, /nuclear/i);
});

test("nuclear-safety batteries drop exactly the Chapter III and VIII rows (Art 1(6))", () => {
  const base = { category: "industrial-big", role: "manufacturer", location: "eu", under40m: "no" };
  const normal = ids(run(base));
  const nuke = run({ ...base, nuclear: "yes" });
  assert.equal(nuke.verdict.status, "in");
  const dropped = normal.filter((id) => !ids(nuke).includes(id)).sort();
  assert.deepEqual(dropped, ["collection", "epr", "label", "qr"]);
  for (const id of ["substances", "conformity", "passport", "diligence", "recycled", "carbon"]) assert.ok(ids(nuke).includes(id), id);
  assert.ok(nuke.findings.some((f) => /Art 1\(6\)/.test(f.title)));
  assert.ok(!ids(run({ category: "portable", role: "distributor", location: "eu", nuclear: "yes" })).includes("epr-first"));
});

test("the separate-collection symbol already applies between Aug 2025 and Aug 2026", () => {
  const r = run({ category: "portable", role: "manufacturer", location: "eu", today: "2026-01-15" });
  const by = Object.fromEntries(r.timeline.map((t) => [t.id, t.state]));
  assert.equal(by.collection, "applies");
  assert.equal(by.label, "soon");
});

test("category labels carry the Art 3 limits (portable 5 kg or less and not only consumer; LMT 25 kg; L-category over 25 kg is EV)", () => {
  assert.match(cat("portable").label, /5 kg or less/);
  assert.doesNotMatch(cat("portable").label, /consumer use/);
  assert.match(cat("lmt").label, /25 kg or less/);
  assert.match(cat("ev").label, /L-category/);
  assert.match(cat("ev").label, /over 25 kg/);
});

test("an 'importer' established outside the EU is told an importer is EU-established (Art 3)", () => {
  const r = run({ category: "sli", role: "importer", location: "noneu", euOperator: "yes" });
  assert.ok(r.findings.some((f) => f.severity === "high" && /established in the EU \(Art 3\)/.test(f.title)));
  assert.ok(!run({ category: "sli", role: "importer", location: "eu" }).findings.some((f) => /established in the EU \(Art 3\)/.test(f.title)));
});
