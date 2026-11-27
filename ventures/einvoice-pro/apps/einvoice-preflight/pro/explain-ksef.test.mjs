// KSeF FA(3) findings are explained from templates, in DE/FR/EN and Polish, never by the model.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { checkInvoice } from "./check.mjs";
import { KSEF_TEMPLATES } from "./explain-catalog-ksef.mjs";
import { normaliseLang, TEMPLATES } from "./explain-catalog.mjs";
import { CHECKER_NOTICE, ENGLISH_ONLY_NOTICE, explainFindings, guardLlmOutput, LLM_NOTICE } from "./explain.mjs";

const ROOT = new URL("../", import.meta.url);

/** Every PL-nnn id the checker source can emit. */
function plIdsInSource() {
  const ids = new Set();
  for (const f of readdirSync(ROOT).filter((f) => f.endsWith(".mjs") && !f.includes(".test.") && !f.startsWith("build-"))) {
    for (const m of readFileSync(new URL(f, ROOT), "utf8").matchAll(/["'`](PL-\d{3})["'`]/g)) ids.add(m[1]);
  }
  return ids;
}

test("every PL rule id the checker emits has a KSeF template, and no template is for a rule that does not exist", () => {
  const ids = plIdsInSource();
  assert.ok(ids.size >= 20, `found ${ids.size} PL ids`);
  assert.deepEqual([...ids].filter((id) => !KSEF_TEMPLATES[id]).sort(), []);
  assert.deepEqual(Object.keys(KSEF_TEMPLATES).filter((id) => !ids.has(id)).sort(), []);
  for (const id of ids) assert.equal(TEMPLATES[id], KSEF_TEMPLATES[id], `${id} merged into TEMPLATES`);
});

test("every KSeF template has a title and an action in en, de, fr and pl, with the same element names in each", () => {
  for (const [id, t] of Object.entries(KSEF_TEMPLATES)) {
    const names = (/** @type {string} */ s) => [...new Set(s.match(/\b(?:P_\d+\w*|[A-Z][a-z]+[A-Z]\w*)\b/g) ?? [])].sort();
    const en = names(t.en.join(" "));
    for (const lang of /** @type {const} */ (["en", "de", "fr", "pl"])) {
      assert.equal(t[lang].length, 2, `${id} ${lang}`);
      for (const s of t[lang]) assert.ok(s.trim().length > 20, `${id} ${lang}`);
      assert.deepEqual(names(t[lang].join(" ")), en, `${id} ${lang}: FA(3) element names differ from the English text`);
      // A placeholder segment must be in every language or none, so a line number is never lost in one.
      assert.equal(/\{n\}/.test(t[lang][0] + t[lang][1]), /\{n\}/.test(t.en[0] + t.en[1]), `${id} ${lang} {n}`);
    }
  }
});

test("lang=pl is accepted; anything else still falls back to English", () => {
  assert.equal(normaliseLang("pl"), "pl");
  assert.equal(normaliseLang("pl-PL"), "pl");
  assert.equal(normaliseLang("PL"), "pl");
  assert.equal(normaliseLang("cs"), "en");
});

test("a KSeF finding is explained from its template with the line number filled in", async () => {
  const finding = { rule: "PL-005", message: "Line 2: quantity x unit price is 200.00 but P_11 says 250.00.", fix: "Make P_11 equal P_8B x P_9A to the grosz, or correct the quantity or price." };
  const [pl] = await explainFindings([finding], { lang: "pl" });
  assert.equal(pl.explanation.source, "template");
  assert.equal(pl.explanation.lang, "pl");
  assert.match(pl.explanation.title, /^Wartość netto \(P_11\) w wierszu 2 nie jest równa/);
  assert.equal(pl.explanation.notice, undefined);
  const [de] = await explainFindings([{ ...finding, message: "quantity x unit price is 200.00 but P_11 says 250.00." }], { lang: "de" });
  assert.match(de.explanation.title, /^Der Nettobetrag \(P_11\) entspricht nicht/, "the [line] segment is dropped without a line number");
});

test("Polish for a rule without Polish text: the English template, marked, never a model call", async () => {
  let calls = 0;
  const llm = { complete: async () => { calls++; return { data: { title: "x", action: "y" } }; } };
  const [r] = await explainFindings([{ rule: "INV-002", message: "Invoice number (BT-1) is empty.", fix: "" }], { lang: "pl", llm });
  assert.equal(calls, 0);
  assert.equal(r.explanation.source, "template");
  assert.equal(r.explanation.title, TEMPLATES["INV-002"].en[0]);
  assert.equal(r.explanation.notice, ENGLISH_ONLY_NOTICE.pl);
});

test("Polish long tail: model and checker fallbacks carry Polish notices", async () => {
  const finding = { rule: "BR-CO-25", message: "Payment due date (BT-9) missing.", fix: "" };
  const [none] = await explainFindings([finding], { lang: "pl" });
  assert.equal(none.explanation.source, "checker");
  assert.equal(none.explanation.notice, CHECKER_NOTICE.pl);
  const llm = { complete: async () => ({ data: { title: "Brakuje terminu płatności (BT-9).", action: "Dodaj termin płatności." } }) };
  const [m] = await explainFindings([finding], { lang: "pl", llm });
  assert.equal(m.explanation.source, "llm");
  assert.equal(m.explanation.notice, LLM_NOTICE.pl);
});

test("guard: a Polish validity claim from the model is rejected", () => {
  const finding = { rule: "BR-CO-25", message: "Payment due date (BT-9) missing.", fix: "" };
  assert.equal(guardLlmOutput({ title: "Faktura jest poprawna.", action: "Nic nie zmieniaj." }, finding), null);
  assert.equal(guardLlmOutput({ title: "Ta faktura jest prawidłowa (BT-9).", action: "Brak." }, finding), null);
  assert.ok(guardLlmOutput({ title: "Brakuje terminu płatności (BT-9).", action: "Dodaj termin płatności." }, finding));
  assert.equal(guardLlmOutput({ title: "The invoice is valid.", action: "None." }, finding), null, "English claims still caught");
});

test("the paid pipeline explains every finding on the KSeF example files from templates, in all four languages", async () => {
  const files = readdirSync(new URL("examples/", ROOT)).filter((f) => /^fa3-.*\.xml$/.test(f));
  assert.ok(files.length >= 5, `found ${files.length} FA(3) examples`);
  let seen = 0;
  for (const file of files) {
    const source = readFileSync(new URL(`examples/${file}`, ROOT));
    for (const lang of ["de", "fr", "en", "pl"]) {
      const r = await checkInvoice({ name: file, source }, { lang });
      for (const f of r.findings) {
        if (!f.rule.startsWith("PL-")) continue;
        seen++;
        assert.equal(f.explanation.source, "template", `${file} ${lang} ${f.rule}`);
        assert.equal(f.explanation.lang, lang);
        assert.equal(f.explanation.notice, undefined, `${file} ${lang} ${f.rule}`);
      }
    }
  }
  assert.ok(seen >= 4 * 7, `the defects example alone has 7 PL findings; saw ${seen}`);
});
