import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readCui, assess, questions, toText, QUOTES, SRC, CATEGORIES, LDCS, EXAMPLES } from "./cui.mjs";

const run = (t) => { const r = readCui(t); return { r, a: assess(r) }; };

test("the quotes are the ones checked against the sources on 28 Nov 2026 (SOURCES.md, CUI markings)", () => {
  // Every string was checked as a verbatim substring of its source file by script; a changed quote
  // needs that check again, then this hash.
  const h = createHash("sha256").update(JSON.stringify(QUOTES)).digest("hex");
  assert.equal(h, "ddbd860bdc36ffd3bb2d82dc6ac4c5e6a6338977c9433e4e547a0ee44b64ddd7");
  for (const [k, [src]] of Object.entries(QUOTES)) assert.ok(SRC[src], `${k}: unknown source ${src}`);
  for (const c of Object.values(CATEGORIES)) assert.ok(QUOTES[c.quote], c.name);
  for (const l of Object.values(LDCS)) if (l.quote) assert.ok(QUOTES[l.quote], l.name);
});

test("banner: categories and dissemination controls split at // and /", () => {
  const { r } = run("CUI//CTI/EXPT//NOFORN/FEDCON");
  assert.equal(r.banners.length, 1);
  assert.deepEqual(r.banners[0].categories.map((c) => c.code), ["CTI", "EXPT"]);
  assert.deepEqual(r.banners[0].ldcs.map((l) => l.code), ["NOFORN", "FEDCON"]);
  const sp = run("CUI//SP-PROPIN//REL TO USA, GBR").r.banners[0];
  assert.deepEqual(sp.categories, [{ code: "PROPIN", specified: true, text: "SP-PROPIN", known: true }]);
  assert.equal(sp.ldcs[0].code, "REL TO");
  assert.equal(run("CUI//NF").r.banners[0].ldcs[0].code, "NOFORN");
});

test("a banner stops at the first space outside a multi-word control", () => {
  assert.equal(run("CUI//SP-CTI   PAGE 1 OF 3").r.banners[0].text, "CUI//SP-CTI");
  assert.equal(run("CUI//SP-CTI//DL ONLY").r.banners[0].ldcs[0].code, "DL ONLY");
});

test("a bare CUI or CONTROLLED is a banner only on its own line", () => {
  assert.equal(run("CUI").r.banners.length, 1);
  assert.equal(run("  CONTROLLED  ").r.banners.length, 1);
  for (const t of ["CONTROLLED COPY", "EXPORT CONTROLLED", "UNCONTROLLED WHEN PRINTED", "This RFQ includes CUI.", "cui"]) {
    assert.equal(run(t).r.banners.length, 0, t);
  }
});

test("a sentence that names CUI is a mention: ask, not marked", () => {
  const { r, a } = run("Drawings for this RFQ include CUI; see the PO.");
  assert.ok(r.mention);
  assert.equal(a.verdict, "unclear");
  assert.match(questions(a)[0], /contract can identify CUI without marking/);
  assert.equal(run("Contains covered defense information").a.verdict, "unclear");
  assert.equal(run("the cui folder").a.verdict, "none", "lower-case cui in running text is not a mention");
});

test("marked: Level 2 scope, category and control meanings, designation found", () => {
  const { r, a } = run(EXAMPLES.marked);
  assert.equal(a.verdict, "marked");
  assert.equal(r.designation.text, "Program Office (invented)");
  assert.equal(r.poc.text, "buyer@example.com");
  const msgs = a.findings.map((f) => f.message).join("\n");
  assert.match(msgs, /NIST SP 800-171/);
  assert.match(msgs, /SP-CTI: Controlled Technical Information\. SP- means CUI Specified/);
  assert.match(msgs, /FEDCON: Federal employees and contractors only/);
  assert.match(msgs, /Distribution statement D .* also limits/);
  assert.doesNotMatch(msgs, /No "Controlled by:" line/);
  assert.deepEqual(questions(a), []);
});

test("marked without a Controlled by line asks who designated it", () => {
  const { a } = run("CUI\nPart 12-4 rev A\nCUI");
  assert.equal(a.verdict, "marked");
  assert.match(questions(a).join("\n"), /No "Controlled by:" line found/);
});

test("banners that differ between pages: ask for a corrected copy", () => {
  const { a } = run("CUI//SP-CTI\nControlled by: X\npage 2\nCUI");
  assert.match(questions(a).join("\n"), /not the same on every page/);
  const f = a.findings.find((x) => /not the same/.test(x.message));
  assert.equal(f.cite.key, "samePage");
});

test("NOCON and FED ONLY are questions for the sender; an unknown category says look it up", () => {
  assert.match(questions(run("CUI//SP-CTI//NOCON\nControlled by: X").a)[0], /Contractors may not receive it/);
  assert.match(questions(run("CUI//FED ONLY\nControlled by: X").a)[0], /Contractors are not on the list/);
  const unk = run("CUI//SP-XYZ\nControlled by: X").a.findings.find((f) => /^SP-XYZ/.test(f.message));
  assert.match(unk.message, /does not list \(CUI Specified\)/);
});

test("portion markings alone count as marked and ask for a banner", () => {
  const { r, a } = run("(CUI) Bore depth per note 4\n(U) Finish: anodize");
  assert.deepEqual(r.portions, { cui: 1, u: 1 });
  assert.equal(a.verdict, "marked");
  assert.match(questions(a).join("\n"), /Portion markings with no banner/);
});

test("distribution statement B to F with no banner: treat as CUI (DFARS 7012's definition)", () => {
  for (const s of "BCDEF") {
    const { a } = run(`DISTRIBUTION STATEMENT ${s}`);
    assert.equal(a.verdict, "treat", s);
    assert.equal(a.findings[0].cite.key, "ctiDist");
  }
  const pub = run(EXAMPLES.public).a;
  assert.equal(pub.verdict, "none");
  assert.match(pub.findings[0].message, /approved for public release/);
});

test("legacy FOUO and export wording without a banner: ask, citing the void-legacy rule", () => {
  const { r, a } = run(EXAMPLES.legacy);
  assert.deepEqual(r.legacy.map((x) => x.code), ["FOUO"]);
  assert.equal(a.verdict, "unclear");
  const qs = questions(a);
  assert.equal(qs.length, 2);
  assert.match(qs[0], /before the CUI Program/);
  assert.match(qs[1], /Export Controlled is a CUI category/);
  assert.equal(run("SENSITIVE BUT UNCLASSIFIED").r.legacy[0].code, "SBU");
  assert.equal(run("Ship by bus").r.legacy.length, 0, "SBU is upper case only");
});

test("legacy marking next to a CUI banner is a note, not a question", () => {
  const { a } = run("CUI\nControlled by: X\nFOUO");
  assert.equal(a.verdict, "marked");
  assert.match(a.findings.find((f) => /FOUO/.test(f.message)).message, /The CUI banner is the one that counts/);
});

test("nothing found still says unmarked CUI is CUI", () => {
  const { a } = run("BRACKET 6061-T6 QTY 50");
  assert.equal(a.verdict, "none");
  assert.equal(a.findings.length, 1);
  assert.equal(a.findings[0].cite.key, "noMarkingNoExemption");
  assert.equal(run("").a.verdict, "none");
  assert.equal(run(null).a.verdict, "none");
});

test("decontrol date is reported", () => {
  const { r, a } = run("CUI\nControlled by: X\nDecontrol on: 2031-01-01");
  assert.equal(r.decontrol.text, "2031-01-01");
  assert.ok(a.findings.some((f) => f.cite?.key === "decontrol"));
});

test("text summary carries every finding, its source and the self-check line", () => {
  const { r, a } = run(EXAMPLES.marked);
  const t = toText(r, a);
  assert.match(t, /^CUI marking check: Marked CUI/);
  assert.equal((t.match(/  Source: "/g) || []).length, a.findings.filter((f) => f.cite).length);
  assert.match(t, /not a determination that the file is or is not CUI/);
});

test("long hostile input stays fast (no catastrophic backtracking)", () => {
  const t0 = Date.now();
  readCui("CUI//" + "A/".repeat(20000) + "\n" + "(CUI//".repeat(5000) + "\n" + "Controlled by:" + " ".repeat(50000));
  readCui(("CUI//SP-CTI//REL TO USA, " + "GBR, ".repeat(3000)).slice(0, 60000));
  assert.ok(Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
});

test("the page quotes only strings from QUOTES and builds its DOM without innerHTML", () => {
  const html = readFileSync(new URL("./cui-markings.html", import.meta.url), "utf8");
  const quotes = new Set(Object.values(QUOTES).map(([, s]) => s));
  const found = [...html.matchAll(/<q>([\s\S]*?)<\/q>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
  assert.ok(found.length >= 5, "the page should quote its sources");
  for (const s of found) assert.ok(quotes.has(s), `not a checked quote: ${s}`);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});
