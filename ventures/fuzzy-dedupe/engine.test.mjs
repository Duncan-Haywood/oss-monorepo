import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jaro, jaroWinkler, editDistance, soundex, normEmail, normPhone, normCompany, normStreet, canonicalGiven, normDate,
  parseCsv, csvCell, guessTypes, compareField, emFit, rng, analyze, annotatedCsv, mergedCsv, LEVELS, PAPERS, DEFAULTS,
} from "./engine.mjs";
import { CONTACTS, FEBRL1 } from "./example-data.mjs";
import { truthPairs, score, exactBaseline } from "./eval/febrl.mjs";

const close = (a, b, tol = 5e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("Jaro and Jaro-Winkler match the published worked examples", () => {
  // Winkler (1990) and the standard textbook pairs (also Wikipedia's "Jaro-Winkler distance" examples).
  close(jaro("MARTHA", "MARHTA"), 0.944);
  close(jaroWinkler("MARTHA", "MARHTA"), 0.961);
  close(jaro("DWAYNE", "DUANE"), 0.822);
  close(jaroWinkler("DWAYNE", "DUANE"), 0.84);
  close(jaro("DIXON", "DICKSONX"), 0.767);
  close(jaroWinkler("DIXON", "DICKSONX"), 0.813);
  assert.equal(jaro("", ""), 0);
  assert.equal(jaro("abc", "abc"), 1);
  assert.equal(jaro("abc", "xyz"), 0);
});

test("Jaro-Winkler is symmetric and within [0, 1] on random strings", () => {
  const r = rng(7);
  const word = () => Array.from({ length: 1 + Math.floor(r() * 9) }, () => "abcde"[Math.floor(r() * 5)]).join("");
  for (let i = 0; i < 2000; i++) {
    const a = word(), b = word();
    const x = jaroWinkler(a, b), y = jaroWinkler(b, a);
    close(x, y, 1e-12);
    assert.ok(x >= 0 && x <= 1);
  }
});

test("edit distance counts a transposition as one edit and caps", () => {
  assert.equal(editDistance("abcd", "abdc", 2), 1);
  assert.equal(editDistance("kitten", "sitting", 5), 3);
  assert.equal(editDistance("abc", "abcdefg", 2), 3);
});

test("soundex follows the standard coding", () => {
  assert.equal(soundex("Robert"), "R163");
  assert.equal(soundex("Rupert"), "R163");
  assert.equal(soundex("Ashcraft"), "A261");
  assert.equal(soundex("Tymczak"), "T522");
  assert.equal(soundex("Pfister"), "P236");
});

test("normalisers join the variants a contact list holds", () => {
  assert.equal(normEmail(" John.Smith+news@GoogleMail.com"), "johnsmith@gmail.com");
  assert.equal(normEmail("j.smith+x@example.com"), "j.smith@example.com");
  assert.equal(normPhone("+1 (555) 201-3344"), "5552013344");
  assert.equal(normCompany("The Northwind Bakery, LLC"), "northwind bakery");
  assert.equal(normStreet("12 Main St."), "12 main street");
  assert.equal(canonicalGiven("Bob"), "robert");
  assert.equal(canonicalGiven("María"), "maria");
  assert.equal(normDate("1980-3-7"), "19800307");
  assert.equal(normDate("03/07/1980"), "19800307");
});

test("comparison levels: exact, close, different and blank", () => {
  assert.equal(compareField("surname", "raman", "raman"), 0);
  assert.equal(compareField("surname", "raman", "ramen"), 2); // Jaro-Winkler 0.907
  assert.equal(compareField("surname", "kowalski", "kowalsky"), 1);
  assert.equal(compareField("surname", "raman", "okafor"), LEVELS.surname.length - 1);
  assert.equal(compareField("surname", "", "raman"), null);
  assert.equal(compareField("date", "19800307", "19800703"), 1);
  assert.equal(compareField("phone", "5552013344", "2013344"), 1);
  assert.equal(compareField("given", "j", "james"), 3);
});

test("CSV parsing handles quotes, embedded commas and semicolons; output guards formulas", () => {
  const { header, rows } = parseCsv('a,b\n"x, y","say ""hi"""\n\n1,2\n');
  assert.deepEqual(header, ["a", "b"]);
  assert.deepEqual(rows, [["x, y", 'say "hi"'], ["1", "2"]]);
  assert.deepEqual(parseCsv("a;b\n1;2").rows, [["1", "2"]]);
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("-12.5"), "-12.5");
  assert.equal(csvCell("+1 555"), "'+1 555");
});

test("column types are guessed from common CRM headers", () => {
  assert.deepEqual(guessTypes(["Record ID", "First Name", "Last Name", "Email Address", "Mobile Phone", "Company Name", "Street Address", "City", "Postal Code", "State/Region"]),
    ["ignore", "given", "surname", "email", "phone", "company", "street", "city", "postcode", "state"]);
});

test("EM recovers m, u and the match share from simulated comparison vectors", () => {
  const r = rng(3);
  const fields = ["surname", "city", "postcode"];
  const m = [[0.8, 0.1, 0.05, 0.05], [0.85, 0.1, 0.05], [0.9, 0.05, 0.05]];
  const u = [[0.02, 0.03, 0.05, 0.9], [0.05, 0.05, 0.9], [0.01, 0.04, 0.95]];
  const draw = (p) => { let x = r(), k = 0; while (k < p.length - 1 && x >= p[k]) { x -= p[k]; k++; } return k; };
  const g = [];
  for (let i = 0; i < 20000; i++) { const match = r() < 0.3; g.push(fields.map((_, k) => draw(match ? m[k] : u[k]))); }
  const fit = emFit(fields, g, u.map((x) => x.map(() => 1 / x.length)), { iterations: 500, tol: 1e-9 });
  close(fit.lambda, 0.3, 0.02);
  fit.m.forEach((mk, k) => mk.forEach((x, l) => close(x, m[k][l], 0.03)));
  fit.u.forEach((uk, k) => uk.forEach((x, l) => close(x, u[k][l], 0.03)));
});

test("Febrl 1: pinned recall and precision, far above exact matching", () => {
  const { header, rows } = parseCsv(FEBRL1);
  const r = analyze({ header, rows });
  const pairs = new Set();
  for (const g of r.groups) for (let a = 0; a < g.members.length; a++) for (let b = a + 1; b < g.members.length; b++) pairs.add(`${g.members[a]},${g.members[b]}`);
  const s = score(truthPairs(rows), pairs);
  assert.equal(s.truePairs, 500);
  assert.ok(s.recall >= 0.998, `recall ${s.recall}`);
  assert.equal(s.precision, 1);
  const base = score(truthPairs(rows), exactBaseline(header, rows));
  close(base.recall, 0.362, 0.001);
  assert.ok(r.candidatePairs < r.allPairs / 100, "blocking keeps comparisons under 1% of all pairs");
});

test("contact example: the intended duplicates group and the colleagues are held for review", () => {
  const { header, rows } = parseCsv(CONTACTS);
  const r = analyze({ header, rows });
  const groups = r.groups.map((g) => g.members.map((i) => rows[i][0] + " " + rows[i][1]).join(" + "));
  assert.deepEqual(groups, [
    "Maria Okafor + María Okafor", "Robert Lindqvist + Bob Lindqvist", "Priya Raman + Priya Ramen",
    "James Whitfield + Jim Whitfield", "Chen Wei + Wei Chen", "Sarah Kowalski + Sara Kowalsky",
    "Daniel Ortiz + Danny Ortiz", "Thomas Grant + Tom Grant",
  ]);
  const held = r.review.filter((p) => p.held).map((p) => rows[p.b][0]);
  assert.deepEqual(held.sort(), ["Grace", "Grace", "Marisol", "Marisol"]);
  const off = analyze({ header, rows, differentNameGuard: false });
  assert.ok(off.groups.some((g) => g.members.some((i) => rows[i][0] === "Grace")), "without the guard the colleague merges");
});

test("merged CSV has one row per person and fills blanks from the group", () => {
  const { header, rows } = parseCsv(CONTACTS);
  const r = analyze({ header, rows });
  const out = parseCsv(mergedCsv(r, rows));
  assert.equal(out.rows.length, rows.length - r.removable);
  const bob = out.rows.find((x) => x[1] === "Lindqvist");
  assert.equal(bob[2], "rob.lindqvist@example.net");
  assert.equal(bob.at(-2), "2");
  const ann = parseCsv(annotatedCsv(r, rows));
  assert.equal(ann.rows.length, rows.length);
  assert.deepEqual(ann.header.slice(-5), ["duplicate_group", "group_size", "keep", "best_match_row", "match_probability"]);
  assert.equal(ann.rows.filter((x) => x.at(-3) === "yes").length, r.groups.length);
});

test("result does not depend on row order", () => {
  const { header, rows } = parseCsv(FEBRL1);
  const r1 = analyze({ header, rows });
  const perm = rows.map((row, i) => [row, i]).reverse();
  const r2 = analyze({ header, rows: perm.map((x) => x[0]) });
  const key = (r, map) => r.groups.map((g) => g.members.map(map).sort((a, b) => a - b).join(",")).sort().join(" ");
  const a = key(r1, (i) => i), b = key(r2, (i) => perm[i][1]);
  const sa = new Set(a.split(" ")), sb = new Set(b.split(" "));
  let same = 0;
  for (const x of sa) if (sb.has(x)) same++;
  assert.ok(same / sa.size > 0.995, `${same} of ${sa.size} groups identical after reversing rows`);
});

test("errors name the problem", () => {
  assert.throws(() => analyze({ csv: "" }), /header/);
  assert.throws(() => analyze({ csv: "a\n1" }), /two data rows/);
  assert.throws(() => analyze({ csv: "notes,misc\nx,y\nz,w" }), /No column is set/);
  assert.throws(() => analyze({ csv: "a,b\n1,2\n3,4", types: ["given", "bogus"] }), /Unknown field type/);
});

test("PAPERS and DEFAULTS are exported for agents", () => {
  assert.ok(PAPERS.length >= 4);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], k);
  assert.equal(DEFAULTS.matchThreshold, 0.9);
});
