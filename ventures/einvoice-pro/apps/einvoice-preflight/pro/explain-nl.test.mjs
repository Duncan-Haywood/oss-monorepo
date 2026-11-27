// Dutch explanations: every non-KSeF rule has nl text that keeps the English text's codes, numbers
// and placeholders; lang=nl runs end to end without a model call. Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { checkInvoice } from "./check.mjs";
import { KSEF_TEMPLATES } from "./explain-catalog-ksef.mjs";
import { NL_TEXTS } from "./explain-catalog-nl.mjs";
import { fill, normaliseLang, TEMPLATES } from "./explain-catalog.mjs";
import { CHECKER_NOTICE, ENGLISH_ONLY_NOTICE, explainFindings, guardLlmOutput, LLM_NOTICE } from "./explain.mjs";
import { FakeLlm } from "./fake-llm.mjs";

const ROOT = new URL("../", import.meta.url);

test("every rule except the KSeF ones has Dutch text, and the Dutch file names no unknown rule", () => {
  const want = Object.keys(TEMPLATES).filter((id) => !KSEF_TEMPLATES[id]).sort();
  assert.ok(want.length > 100, `found ${want.length}`);
  assert.deepEqual(Object.keys(NL_TEXTS).sort(), want);
  for (const id of want) {
    assert.equal(TEMPLATES[id].nl, NL_TEXTS[id], `${id} merged`);
    assert.equal(TEMPLATES[id].nl?.length, 2, id);
    for (const s of TEMPLATES[id].nl ?? []) assert.ok(s.trim().length > 10, id);
  }
});

/** Codes, field numbers, URNs, file names and amounts that must survive translation unchanged. */
const tokens = (/** @type {string} */ s) =>
  [...new Set(s.match(/urn:\S+?(?=[ )]|\.?$)|\bB[TG]-\d+|\bBR-[A-Z]+|\/AF|[\w-]+\.xml|\d+(?:[.,/-]\d+)*/g) ?? [])].sort();
// The English text gives German VAT rates as its example; the Dutch one gives the Dutch rates.
const LOCAL_EXAMPLES = new Set(["INV-011"]);

test("Dutch text keeps the English text's codes, numbers and placeholders", () => {
  for (const [id, nl] of Object.entries(NL_TEXTS)) {
    const en = TEMPLATES[id].en;
    for (const i of [0, 1]) {
      const ph = (/** @type {string} */ s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(ph(nl[i]), ph(en[i]), `${id}[${i}] placeholders`);
      assert.equal((nl[i].match(/\[/g) ?? []).length, (en[i].match(/\[/g) ?? []).length, `${id}[${i}] optional segments`);
      assert.ok(!/\{party\}s/.test(nl[i]), `${id}[${i}] uses the German genitive form`);
      if (!LOCAL_EXAMPLES.has(id)) assert.deepEqual(tokens(nl[i]), tokens(en[i]), `${id}[${i}] codes and numbers`);
    }
  }
});

test("party names and optional segments fill in Dutch", () => {
  assert.equal(fill(NL_TEXTS["INV-006"][0], { party: "buyer" }, "nl"), "De naam van de koper ontbreekt; een factuur moet beide partijen vermelden.");
  assert.equal(fill(NL_TEXTS["INV-008"][0], { n: "3" }, "nl"), "Regel 3 heeft geen omschrijving van wat er geleverd is.");
  assert.equal(fill(NL_TEXTS["INV-017"][1], { value: "396.60" }, "nl"), "Zet het bruto totaal op 396.60 of corrigeer netto en btw.");
  assert.equal(fill(NL_TEXTS["INV-017"][1], {}, "nl"), "Zet het bruto totaal of corrigeer netto en btw.");
  assert.equal(normaliseLang("nl"), "nl");
  assert.equal(normaliseLang("nl-BE"), "nl");
  assert.equal(normaliseLang("NL"), "nl");
});

test("lang=nl: a templated rule is explained in Dutch, with no model call", async () => {
  const llm = new FakeLlm();
  const [f] = await explainFindings(
    [{ rule: "INV-017", message: "Gross total does not equal net plus tax.", fix: "Set gross total to 396.60 or correct the totals." }],
    { lang: "nl", llm },
  );
  assert.equal(f.explanation.source, "template");
  assert.equal(f.explanation.lang, "nl");
  assert.match(f.explanation.title, /bruto totaal/);
  assert.match(f.explanation.action, /396\.60/);
  assert.equal(f.explanation.notice, undefined);
  assert.equal(llm.calls.length, 0);
});

test("lang=nl: a KSeF rule gets the English template with a Dutch notice", async () => {
  const id = Object.keys(KSEF_TEMPLATES)[0];
  const [f] = await explainFindings([{ rule: id, message: "m", fix: "" }], { lang: "nl" });
  assert.equal(f.explanation.source, "template");
  assert.equal(f.explanation.lang, "nl");
  assert.equal(f.explanation.notice, ENGLISH_ONLY_NOTICE.nl);
  assert.equal(f.explanation.title, fill(KSEF_TEMPLATES[id].en[0], {}, "en"));
});

test("lang=nl: the long tail goes to the model with a Dutch AI notice, or the checker text with a Dutch notice", async () => {
  const finding = { rule: "BR-CO-25", message: "Payment due date (BT-9) missing.", fix: "" };
  const llm = new FakeLlm({ "explain.rule": () => ({ title: "De vervaldatum (BT-9) ontbreekt.", action: "Voeg de vervaldatum toe." }) });
  const [a] = await explainFindings([finding], { lang: "nl", llm });
  assert.equal(a.explanation.source, "llm");
  assert.equal(a.explanation.notice, LLM_NOTICE.nl);
  assert.match(JSON.parse(llm.calls[0].prompt).lang, /^nl$/);
  const [b] = await explainFindings([finding], { lang: "nl" });
  assert.equal(b.explanation.source, "checker");
  assert.equal(b.explanation.notice, CHECKER_NOTICE.nl);
});

test("guard: a Dutch validity claim is refused, a Dutch 'does not comply' is not", () => {
  const finding = { rule: "BR-CO-25", message: "Payment due date (BT-9) missing.", fix: "" };
  for (const claim of ["De factuur is geldig.", "De factuur is correct.", "Verder is alles in orde: de factuur is in orde.", "Het bestand voldoet aan de regels."]) {
    assert.equal(guardLlmOutput({ title: claim, action: "Voeg BT-9 toe." }, finding), null, claim);
  }
  assert.deepEqual(guardLlmOutput({ title: "De factuur voldoet niet: de vervaldatum (BT-9) ontbreekt.", action: "Voeg de vervaldatum toe." }, finding), {
    title: "De factuur voldoet niet: de vervaldatum (BT-9) ontbreekt.",
    action: "Voeg de vervaldatum toe.",
  });
});

test("the paid pipeline explains every templated finding on the example files in Dutch", async () => {
  const files = readdirSync(new URL("examples/", ROOT)).filter((f) => /\.(xml|pdf)$/.test(f) && !f.startsWith("fa3-"));
  assert.ok(files.length >= 20, `found ${files.length} examples`);
  const rules = new Set();
  for (const file of files) {
    const r = await checkInvoice({ name: file, source: readFileSync(new URL(`examples/${file}`, ROOT)) }, { lang: "nl" });
    assert.equal(r.lang, "nl");
    for (const f of r.findings) {
      if (!TEMPLATES[f.rule]) continue;
      rules.add(f.rule);
      assert.equal(f.explanation.source, "template", `${file} ${f.rule}`);
      assert.equal(f.explanation.notice, undefined, `${file} ${f.rule}`);
      assert.ok(TEMPLATES[f.rule].nl, `${file} ${f.rule}`);
    }
  }
  assert.ok(rules.size >= 10, `templated rules seen: ${[...rules].join(" ")}`);
});
