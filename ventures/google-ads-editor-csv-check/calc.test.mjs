import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, adWidth, keywordShape, decodeBuffer, canonHeader, closestColumn, findingsCsv, sampleFile, sampleBrokenFile } from "./calc.mjs";

const H = ["Campaign", "Ad group", "Keyword", "Criterion Type", "Max CPC", "Final URL", "Campaign Daily Budget", "Status", "Headline 1", "Headline 2", "Headline 3", "Description 1", "Description 2", "Path 1", "Path 2"];
const file = (...rows) => toCsv([H, ...rows.map((o) => H.map((k) => o[k] ?? ""))]);
const codes = (r) => r.findings.map((f) => f.code);
const kw = { Campaign: "C", "Ad group": "G", Keyword: "red shoes", "Criterion Type": "Phrase", "Max CPC": "1.20", Status: "Enabled" };
const ad = { Campaign: "C", "Ad group": "G", "Final URL": "https://x.test/", "Headline 1": "Red Shoes", "Headline 2": "Free Returns", "Headline 3": "Ships Today", "Description 1": "Hand finished leather shoes.", "Description 2": "Order before 3pm.", "Path 1": "shoes" };

test("the clean example has no errors or warnings, the broken one has both", () => {
  assert.deepEqual(validate(sampleFile()).findings.filter((f) => f.severity !== "info"), []);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error") && bad.findings.some((f) => f.severity === "warning"));
});

test("header cleanup and aliases", () => {
  assert.equal(canonHeader(" Ad_group "), "adgroup");
  assert.equal(closestColumn("Headlne 1"), "Headline 1");
  const r = validate("Campaign Name,Ad Group Name,Keyword Text,Match Type\nC,G,red shoes,Phrase\n");
  assert.ok(codes(r).includes("report-header"));
  assert.ok(!codes(r).includes("criterion-blank"));
});

test("clean keyword and ad rows pass", () => {
  assert.deepEqual(validate(file(kw, ad)).findings, []);
});

test("width counts full-width characters double", () => {
  assert.equal(adWidth("abc"), 3);
  assert.equal(adWidth("日本語"), 6);
  const long = { ...ad, "Headline 1": "日".repeat(16) };
  assert.ok(codes(validate(file(long))).includes("headline-length"));
});

test("headline and description limits, bangs, caps, duplicates", () => {
  const r = validate(file({ ...ad, "Headline 1": "A".repeat(31) + "!", "Headline 2": "A".repeat(31) + "!", "Description 1": "x".repeat(91) }));
  for (const c of ["headline-length", "headline-bang", "headline-dup", "description-length"]) assert.ok(codes(r).includes(c), c);
  assert.ok(codes(validate(file({ ...ad, "Headline 1": "BUY RED SHOES NOW" }))).includes("headline-caps"));
});

test("responsive search ad needs three headlines and two descriptions", () => {
  const r = validate(file({ ...ad, "Headline 3": "", "Description 2": "" }));
  assert.ok(codes(r).includes("headline-count") && codes(r).includes("description-count"));
});

test("paths: length, order, characters", () => {
  assert.ok(codes(validate(file({ ...ad, "Path 1": "x".repeat(16) }))).includes("path-length"));
  assert.ok(codes(validate(file({ ...ad, "Path 1": "", "Path 2": "sale" }))).includes("path-order"));
  assert.ok(codes(validate(file({ ...ad, "Path 1": "red shoes" }))).includes("path-chars"));
});

test("final URL rules", () => {
  assert.ok(codes(validate(file({ ...ad, "Final URL": "x.test/a" }))).includes("url"));
  assert.ok(codes(validate(file({ ...ad, "Final URL": "https://x.test/a b" }))).includes("url-space"));
  assert.ok(codes(validate(file({ ...ad, "Final URL": "http://x.test/" }))).includes("url-http"));
  assert.ok(codes(validate(file({ ...ad, "Final URL": "" }))).includes("url-blank"));
});

test("keyword rules: symbols, plus signs, length, words, duplicates, match type", () => {
  assert.ok(codes(validate(file({ ...kw, Keyword: "red (shoes)" }))).includes("keyword-symbol"));
  assert.ok(codes(validate(file({ ...kw, Keyword: "+red +shoes" }))).includes("bmm"));
  assert.ok(codes(validate(file({ ...kw, Keyword: "a ".repeat(11).trim() }))).includes("keyword-words"));
  assert.ok(codes(validate(file({ ...kw, Keyword: "x".repeat(81) }))).includes("keyword-length"));
  assert.ok(codes(validate(file(kw, { ...kw, Keyword: "Red  Shoes" }))).includes("dup-keyword"));
  assert.ok(!codes(validate(file(kw, { ...kw, "Criterion Type": "Exact" }))).includes("dup-keyword"));
  assert.ok(codes(validate(file({ ...kw, Keyword: "[red shoes]", "Criterion Type": "Broad" }))).includes("match-mismatch"));
  assert.ok(codes(validate(file({ ...kw, "Criterion Type": "Fuzzy" }))).includes("criterion"));
  assert.ok(codes(validate(file({ ...kw, "Criterion Type": "" }))).includes("criterion-blank"));
});

test("ad group, status, budget and bids", () => {
  assert.ok(codes(validate(file({ ...kw, "Ad group": "" }))).includes("adgroup-blank"));
  assert.ok(!codes(validate(file({ ...kw, "Ad group": "", "Criterion Type": "Campaign Negative Phrase" }))).includes("adgroup-blank"));
  assert.ok(codes(validate(file({ ...kw, Status: "Live" }))).includes("status"));
  assert.ok(codes(validate(file({ Campaign: "C", "Campaign Daily Budget": "twenty" }))).includes("budget"));
  assert.ok(codes(validate(file({ Campaign: "C", "Campaign Daily Budget": "£20" }))).includes("budget-format"));
  assert.ok(codes(validate(file({ ...kw, "Max CPC": "0" }))).includes("cpc-zero"));
  assert.ok(codes(validate(file({ ...kw, "Max CPC": "1.5E+3" }))).includes("cpc"));
});

test("a row with both a keyword and an ad is flagged", () => {
  assert.ok(codes(validate(file({ ...kw, ...ad, Keyword: "red shoes" }))).includes("mixed-row"));
});

test("structure: delimiter, UTF-16, unterminated quote, wide rows, missing column", () => {
  assert.ok(codes(validate("Campaign;Ad group;Keyword\nC;G;x\n")).includes("delimiter"));
  assert.ok(codes(validate("Campaign,Keyword\u0000\nC,x\n")).includes("utf16"));
  assert.ok(codes(validate('Campaign,Ad group\n"C,G\n')).includes("quote"));
  assert.ok(codes(validate("Campaign,Ad group\nC,G,extra\n")).includes("extra-cells"));
  assert.ok(codes(validate("Ad group,Keyword\nG,x\n")).includes("missing-column"));
  assert.ok(codes(validate("")).includes("empty"));
});

test("repair: delimiter, spaces, case, numbers, brackets; leaves words and URLs alone", () => {
  const fix = repair("Campaign;Ad group;Keyword;Criterion Type;Max CPC;Status\n C ;G;[red shoes];Exact;$1.20;paused\n");
  assert.equal(fix.error, null);
  assert.ok(fix.changes.length >= 5);
  const back = parseCsv(fix.text).rows.map((r) => r.cells);
  assert.deepEqual(back[1], ["C", "G", "red shoes", "Exact", "1.20", "Paused"]);
  const urlRow = repair(`Campaign,Ad group,Final URL\nC,G,https://x.test/A b\n`);
  assert.ok(urlRow.text.includes("https://x.test/A b"));
  assert.deepEqual(repair(sampleFile()).changes, []);
  assert.match(repair('Campaign\n"C').error, /never closed/);
});

test("keywordShape reads brackets and quotes", () => {
  assert.deepEqual(keywordShape("[a b]"), { text: "a b", type: "Exact" });
  assert.deepEqual(keywordShape('"a b"'), { text: "a b", type: "Phrase" });
  assert.deepEqual(keywordShape("a b"), { text: "a b", type: null });
});

test("decodeBuffer reads UTF-16 with a BOM; findingsCsv round trips", () => {
  const u16 = new Uint8Array([0xff, 0xfe, ...Buffer.from("Campaign\n", "utf16le")]);
  assert.equal(decodeBuffer(u16), "Campaign\n");
  const csv = findingsCsv(validate(sampleBrokenFile()));
  assert.equal(parseCsv(csv).rows[0].cells[0], "severity");
});
