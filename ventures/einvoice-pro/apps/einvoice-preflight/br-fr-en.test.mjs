// English text for FNFE-MPE's French BR-FR and BR-FR-CDV messages (br-fr-en.mjs, plain/br-fr-en.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BR_FR_SETS, addEnglish, loadTable } from "./br-fr-en.mjs";

const require = createRequire(import.meta.url);
const set = (name) => JSON.parse(readFileSync(new URL(`./plain/${name}.json`, import.meta.url), "utf8"));
const checks = (rules) => rules.patterns.flatMap((p) => p.rules.flatMap((r) => r.checks));
let ready = existsSync(new URL("./plain/cius-fr-ubl.json", import.meta.url));
try { require.resolve("slimdom"); require.resolve("fontoxpath"); } catch { ready = false; }
const skip = !ready && "needs `npm i --no-save slimdom fontoxpath`";

test("every BR-FR and BR-FR-CDV check carries the English from the table (run `node br-fr-en.mjs` after a rebuild)", () => {
  const table = loadTable();
  for (const name of BR_FR_SETS) {
    for (const c of checks(set(name))) {
      assert.ok(Object.hasOwn(table, c.text), `${name} ${c.id}: no English for ${c.text.slice(0, 80)}`);
      assert.equal(c.en, table[c.text], `${name} ${c.id}: stale en`);
    }
  }
});

test("the table holds no stale entries, and each translation keeps the rule code and the values", () => {
  const table = loadTable();
  const used = new Set(BR_FR_SETS.flatMap((n) => checks(set(n)).map((c) => c.text)));
  assert.deepEqual(Object.keys(table).filter((k) => !used.has(k)), []);
  for (const [fr, en] of Object.entries(table)) {
    assert.ok(en.trim() && en !== fr || !/[éèàùçê]/.test(fr), `untranslated: ${fr.slice(0, 80)}`);
    const code = fr.match(/^\[[^\]]+\]/)?.[0];
    if (code) assert.ok(en.startsWith(code), `${code}: the English lost its code`);
    // code lists and BT/EXT ids the French names must survive the translation
    for (const id of fr.match(/\b(?:BT|BG|EXT-FR-FE|MDT)-[\w-]+/g) || []) assert.ok(en.includes(id), `${id} missing from: ${en.slice(0, 80)}`);
    for (const v of fr.match(/"[A-Z][A-Z0-9_]{2,}"/g) || []) assert.ok(en.includes(v), `${v} missing from: ${en.slice(0, 80)}`);
    assert.doesNotMatch(en, /Valeur actuelle|Veuillez|doit être/, `French left in: ${en.slice(0, 80)}`);
  }
});

test("addEnglish drops a stale `en` when the French text changes", () => {
  const rules = { patterns: [{ rules: [{ checks: [{ id: "X", text: "texte nouveau", en: "old" }] }] }] };
  assert.deepEqual(addEnglish(rules, {}), ["texte nouveau"]);
  assert.equal(rules.patterns[0].rules[0].checks[0].en, undefined);
});

test("a BR-FR finding reads in English and keeps FNFE's French beside it", { skip }, async () => {
  const { runPlain } = await import("./plain-node.mjs");
  const ubl = readFileSync(new URL("./fixtures/fr-fnfe/uc1-en16931-ubl.xml", import.meta.url), "utf8");
  const r = await runPlain(ubl.replace("<cbc:ID>F202500003</cbc:ID>", "<cbc:ID>F 2025.00003</cbc:ID>"), { profile: "france" });
  const f = r.findings.find((x) => x.rule === "BR-FR-02_BT-1");
  assert.ok(f, "BR-FR-02 fires");
  assert.match(f.message, /invoice identifier/i);
  assert.doesNotMatch(f.message, /^\[/);
  assert.match(f.message_fr, /identifiant de facture/);
  // other national sets keep their own text and gain no French field
  assert.ok(r.findings.filter((x) => x.source !== "cius-fr-schematron").every((x) => !("message_fr" in x)));
});

test("a CDAR status finding reads in English too, and the page shows FNFE's French under it", { skip }, async () => {
  const { runPlain } = await import("./plain-node.mjs");
  const rej = readFileSync(new URL("./fixtures/fr-fnfe/cdar/UC2_F202500004_02-CDV-213_Rejetee.xml", import.meta.url), "utf8");
  const r = await runPlain(rej.replace("<ram:ReasonCode>DOUBLON", "<ram:ReasonCode>PAS_UN_MOTIF"));
  const f = r.findings.find((x) => x.rule === "BR-FR-CDV-CL-09_MDT-113");
  assert.ok(f, "BR-FR-CDV-CL-09 fires");
  assert.match(f.message, /status reason code/i);
  assert.match(f.message_fr, /code motif/i);
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.ok(page.includes('error.message_fr ? `<br><span class="fix" lang="fr">FNFE-MPE text: ${escapeHtml(error.message_fr)}'));
});
