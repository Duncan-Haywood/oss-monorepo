import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, detectLabel, analyze, auc, applyRules, parseRules, syntheticCsv, prepare, fit, score, MIN_PER_CLASS } from "./engine.mjs";

test("parseCsv handles quotes, embedded commas and newlines, CRLF and tab pastes", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
  assert.deepEqual(parseCsv('a,b\n"line1\nline2",2'), [["a", "b"], ["line1\nline2", "2"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv("﻿a,b\n\n1,2\n"), [["a", "b"], ["1", "2"]]);
});

test("auc: perfect, reversed, tied", () => {
  assert.equal(auc([3, 4], [1, 2]), 1);
  assert.equal(auc([1, 2], [3, 4]), 0);
  assert.equal(auc([1], [1]), 0.5);
  assert.equal(auc([], [1]), null);
});

test("detectLabel finds the won/lost column and ignores a column with only one class", () => {
  const h = ["name", "tier", "status"], rows = [["a", "won", "won"], ["b", "won", "lost"], ["c", "won", ""]];
  assert.equal(detectLabel(h, rows), 2);
});

test("learns a planted profile: leave-one-out AUC is well above chance and the top prospects fit it", () => {
  const r = analyze(syntheticCsv(7, 400));
  assert.ok(r.learned && r.reliable, r.note);
  assert.ok(r.validation.auc > 0.65, `auc ${r.validation.auc}`);
  assert.ok(r.validation.lift > 1.2);
  assert.equal(r.prospects.length, 30);
  assert.equal(r.prospects[0].rank, 1);
  const fits = r.prospects.map((p) => p.fit);
  assert.deepEqual(fits, [...fits].sort((a, b) => b - a));
  assert.ok(r.profile.some((p) => p.feature === "source" && p.value === "referral"));
  const top = r.prospects[0];
  assert.ok(top.because.length >= 1 && top.because[0].includes("more common among wins"));
  assert.ok(["A", "B", "C"].includes(top.tier));
});

test("pure noise: the validation says so instead of presenting a ranking as signal", () => {
  let s = 3; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const lines = ["name,industry,size,status"];
  for (let i = 0; i < 200; i++) lines.push(`c${i},${["a", "b", "c", "d"][Math.floor(rnd() * 4)]},${Math.floor(rnd() * 500)},${rnd() < 0.4 ? "won" : "lost"}`);
  const r = analyze(lines.join("\n"));
  assert.ok(r.learned);
  assert.ok(r.validation.auc < 0.62, `auc ${r.validation.auc}`);
  if (!r.reliable) assert.match(r.note, /barely better than a coin flip/);
});

test("too few wins or losses: refuses to learn and says how many it has", () => {
  const lines = ["name,industry,status"];
  for (let i = 0; i < 5; i++) lines.push(`w${i},saas,won`);
  for (let i = 0; i < 30; i++) lines.push(`l${i},retail,lost`);
  lines.push("p,saas,");
  const r = analyze(lines.join("\n"));
  assert.equal(r.learned, false);
  assert.match(r.note, new RegExp(`at least ${MIN_PER_CLASS}`));
  assert.match(r.note, /5 won and 30 lost/);
  assert.equal(r.prospects.length, 0);
});

test("no won/lost column is reported, not guessed", () => {
  const r = analyze("name,industry\nA,saas\nB,retail\nC,saas");
  assert.equal(r.learned, false); assert.match(r.note, /No won\/lost column/);
});

test("identifier-like, free text and mostly blank columns are dropped with a reason", () => {
  const lines = ["name,email,account_code,industry,notes,status"];
  for (let i = 0; i < 40; i++) lines.push(`c${i},c${i}@x.com,AC${i},${i % 2 ? "saas" : "retail"},,${i % 3 ? "won" : "lost"}`);
  const prep = prepare(parseCsv(lines.join("\n")));
  assert.deepEqual(prep.features.map((f) => f.name), ["industry"]);
  const why = Object.fromEntries(prep.dropped.map((d) => [d.column, d.reason]));
  assert.match(why.email, /identifier/); assert.match(why.account_code, /identifier/); assert.match(why.notes, /identifier|blank/);
});

test("leave-one-out really holds the row out: a value seen only on the held row gets no credit for itself", () => {
  const lines = ["name,industry,status"];
  for (let i = 0; i < 12; i++) lines.push(`w${i},${i % 2 ? "saas" : "retail"},won`);
  for (let i = 0; i < 12; i++) lines.push(`l${i},${i % 2 ? "saas" : "retail"},lost`);
  lines.push("odd,quirky,won");
  const prep = prepare(parseCsv(lines.join("\n"))), m = fit(prep.examples, prep.features);
  const odd = prep.examples[prep.examples.length - 1];
  const inSample = score(m, prep.features, odd).s, held = score(m, prep.features, odd, odd).s;
  assert.ok(inSample > held + 0.5, `in-sample ${inSample} should beat held-out ${held}`);
});

test("numbers with currency symbols and commas bucket by quartile", () => {
  const lines = ["name,revenue,status"];
  for (let i = 0; i < 40; i++) lines.push(`c${i},"$${(i + 1) * 1000}",${i >= 30 ? "won" : "lost"}`);
  const prep = prepare(parseCsv(lines.join("\n")));
  assert.equal(prep.features[0].type, "number");
  assert.ok(new Set(prep.examples.map((e) => e.vals.revenue)).size >= 3);
});

test("manual rules score the share of rules met and flag unreadable ones", () => {
  const csv = "name,employees,industry,country\nA,50,saas,US\nB,500,saas,US\nC,60,retail,RU\nD,,saas,US";
  const r = applyRules(csv, "employees >= 20\nemployees <= 200\nindustry in saas, fintech\ncountry != RU\nbogus rule\nnope = 1");
  assert.equal(r.rules.length, 4);
  assert.equal(r.errors.length, 2);
  const by = Object.fromEntries(r.prospects.map((p) => [p.name, p]));
  assert.equal(by.A.fit, 100); assert.equal(by.A.tier, "A");
  assert.equal(by.B.fit, 75);
  assert.equal(by.C.fit, 50);
  assert.ok(by.D.missed.some((m) => m.startsWith("employees")));
  assert.equal(r.prospects[0].name, "A");
  assert.equal(parseRules("employees > abc").errors.length, 1);
});

test("synthetic data is deterministic", () => {
  assert.equal(syntheticCsv(7, 50), syntheticCsv(7, 50));
  assert.notEqual(syntheticCsv(7, 50), syntheticCsv(8, 50));
});
