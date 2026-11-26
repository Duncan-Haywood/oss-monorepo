// Explanations: templates per rule id in three languages, the model only for the long tail,
// guarded and marked. Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { extractParams, fill, TEMPLATES } from "./explain-catalog.mjs";
import { explainFindings, guardLlmOutput } from "./explain.mjs";
import { FAKE_HANDLERS, FakeLlm } from "./fake-llm.mjs";

const ROOT = new URL("../", import.meta.url);

test("every built-in rule id the checker can emit has a template", () => {
  const ids = new Set();
  for (const f of readdirSync(ROOT).filter((f) => f.endsWith(".mjs") && !f.includes(".test.") && !f.startsWith("build-"))) {
    const s = readFileSync(new URL(f, ROOT), "utf8");
    for (const m of s.matchAll(/["'`]((?:INV|XR|PP|FR|PDF|CII)-\d{3})["'`]/g)) ids.add(m[1]);
  }
  assert.ok(ids.size > 80, `found ${ids.size} ids`);
  const missing = [...ids].filter((id) => !TEMPLATES[id]);
  assert.deepEqual(missing, []);
});

test("every template has a non-empty title and action in de, fr and en", () => {
  for (const [id, t] of Object.entries(TEMPLATES)) {
    for (const lang of ["de", "fr", "en"]) {
      assert.equal(t[lang].length, 2, `${id} ${lang}`);
      for (const s of t[lang]) assert.ok(s.trim().length > 10, `${id} ${lang}`);
    }
  }
});

test("placeholders: values from the finding, optional segments dropped when absent", () => {
  const p = extractParams({ message: "Line 3 net is missing.", fix: "Set gross total to 396.60 or correct." });
  assert.deepEqual(p, { n: "3", value: "396.60" });
  assert.equal(fill("Setzen Sie die Summe[ auf {value}].", p, "de"), "Setzen Sie die Summe auf 396.60.");
  assert.equal(fill("Setzen Sie die Summe[ auf {value}].", {}, "de"), "Setzen Sie die Summe.");
  assert.equal(fill("Le nom [du {party} ]manque.", { party: "customer" }, "fr"), "Le nom du client manque.");
  assert.equal(fill("Der Name des [{party}s ]fehlt.", { party: "supplier" }, "de"), "Der Name des Lieferanten fehlt.");
});

test("a known rule is explained from its template in the requested language", async () => {
  const llm = new FakeLlm();
  const [f] = await explainFindings(
    [{ rule: "INV-017", message: "Gross total does not equal net plus tax.", fix: "Set gross total to 396.60 or correct the totals.", path: "/totals/gross" }],
    { lang: "fr", llm },
  );
  assert.equal(f.explanation.source, "template");
  assert.equal(f.explanation.lang, "fr");
  assert.match(f.explanation.action, /396\.60/);
  assert.equal(f.rule, "INV-017", "the finding itself is unchanged");
  assert.equal(llm.calls.length, 0, "no model call for a templated rule");
});

test("long-tail rule: the model explains, marked as machine-written, and is cached", async () => {
  const llm = new FakeLlm();
  const finding = { rule: "BR-CO-25", message: "In case the Amount due for payment (BT-115) is positive, either the Payment due date (BT-9) or the Payment terms (BT-20) shall be present.", fix: "" };
  const cache = new Map();
  const [a] = await explainFindings([finding], { lang: "de", llm, cache });
  assert.equal(a.explanation.source, "llm");
  assert.match(a.explanation.notice, /KI/);
  const [b] = await explainFindings([finding], { lang: "de", llm, cache });
  assert.equal(b.explanation.source, "llm");
  assert.equal(llm.calls.length, 1, "second explanation came from the cache");
  assert.equal(llm.calls[0].purpose, "explain.rule");
});

test("without a model, the long tail falls back to the checker's text, marked", async () => {
  const [f] = await explainFindings([{ rule: "BR-FR-12", message: "Something French.", fix: "Do X." }], { lang: "fr" });
  assert.equal(f.explanation.source, "checker");
  assert.equal(f.explanation.title, "Something French.");
  assert.match(f.explanation.notice, /contrôleur/);
});

test("guard: model output that invents a number or claims validity is rejected", async () => {
  const finding = { rule: "BR-CO-25", message: "Payment due date (BT-9) missing.", fix: "" };
  assert.equal(guardLlmOutput({ title: "Due date missing (BT-9).", action: "Add it within 30 days." }, finding), null);
  assert.equal(guardLlmOutput({ title: "Otherwise the invoice is valid.", action: "Add BT-9." }, finding), null);
  assert.equal(guardLlmOutput({ title: "", action: "x" }, finding), null);
  assert.equal(guardLlmOutput("nope", finding), null);
  assert.deepEqual(guardLlmOutput({ title: "The due date (BT-9) is missing.", action: "Add the due date." }, finding), {
    title: "The due date (BT-9) is missing.",
    action: "Add the due date.",
  });
  // End to end: a model that invents a figure is ignored, the checker text is used.
  const liar = new FakeLlm({ "explain.rule": () => ({ title: "Pay 500 EUR fine.", action: "Add BT-9." }) });
  const [f] = await explainFindings([finding], { lang: "en", llm: liar });
  assert.equal(f.explanation.source, "checker");
});

test("a failing model never breaks the check", async () => {
  const broken = { complete: async () => { throw new Error("down"); } };
  const [f] = await explainFindings([{ rule: "BR-01", message: "m", fix: "f" }], { lang: "en", llm: broken });
  assert.equal(f.explanation.source, "checker");
});

test("FakeLlm has a handler for every purpose the paid layer uses", () => {
  const purposes = new Set();
  for (const f of readdirSync(new URL("./", import.meta.url)).filter((f) => f.endsWith(".mjs") && !f.includes(".test."))) {
    const s = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const m of s.matchAll(/purpose:\s*"([\w.]+)"/g)) purposes.add(m[1]);
  }
  assert.ok(purposes.size >= 1);
  for (const p of purposes) assert.ok(FAKE_HANDLERS[p], `FakeLlm handler for ${p}`);
});
