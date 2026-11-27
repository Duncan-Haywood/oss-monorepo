// The workspace in Polish: every page string, the two emails and the dashboard CSV have a Polish
// version, and Polish readers get the English legal texts (there is no Polish translation to link).
// Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { dashboardCsv } from "./dashboard.mjs";
import { message } from "./email.mjs";

const js = readFileSync(new URL("./web/app.js", import.meta.url), "utf8");

/** The page's string table, read from the source (app.js needs a DOM to import). */
function strings() {
  const start = js.indexOf("const T = {");
  const end = js.indexOf("\n};\n", start);
  assert.ok(start >= 0 && end > start, "app.js keeps its strings in `const T = { ... };`");
  return /** @type {Record<string, Record<string, string>>} */ (runInNewContext(`(${js.slice(start + "const T = ".length, end + 2)})`));
}

const placeholders = (/** @type {string} */ s) => (s.match(/\{\w+\}/g) ?? []).sort();

test("every page string has a Polish version with the same placeholders", () => {
  const T = strings();
  assert.deepEqual(Object.keys(T).sort(), ["de", "en", "fr", "nl", "pl"]);
  for (const lang of ["de", "fr", "nl", "pl"]) {
    assert.deepEqual(Object.keys(T[lang]).sort(), Object.keys(T.en).sort(), `${lang} has exactly the English keys`);
    for (const [k, v] of Object.entries(T.en)) {
      assert.ok(T[lang][k].trim(), `${lang}.${k} is not empty`);
      assert.deepEqual(placeholders(T[lang][k]), placeholders(v), `${lang}.${k} keeps the placeholders`);
    }
  }
  assert.match(T.pl.disclaimer, /nie jest doradztwo podatkowe ani prawne/, "the not-advice line is in Polish");
  assert.match(T.pl.accept, /wersja angielska/, "the sign-up says the English legal text governs");
});

test("Polish is offered in the switcher and picked from the browser language", () => {
  assert.match(js, /\(\["de", "fr", "en", "nl", "pl"\]\)\.map\(\(l\) =>/);
  assert.match(js, /nav === "de" \|\| nav === "fr" \|\| nav === "nl" \|\| nav === "pl"/);
  assert.match(js, /saved === "pl"/);
});

test("legal links: German and French get their translation, Polish the English text", () => {
  assert.match(js, /state\.lang === "de" \|\| state\.lang === "fr" \? `\/app\/\$\{state\.lang\}\/\$\{k\}` : `\/app\/\$\{k\}`/);
});

test("both emails exist in Polish, keep the link, and neutralise the firm name", () => {
  for (const kind of /** @type {const} */ (["verify", "signin"])) {
    const m = message(kind, "pl", { firm: "Biuro\r\nRachunkowe", link: "https://e.example/app#x=1" });
    assert.match(m.subject, /e-faktur/);
    assert.ok(m.text.includes("https://e.example/app#x=1"));
    assert.ok(!/\r|Biuro\nRachunkowe/.test(m.text), "no header-style line break from the firm name");
    assert.match(m.text, /zignoruj/);
  }
});

test("the dashboard CSV has Polish headings and statuses", () => {
  const d = { days: 30, clients: [{ name: "Firma", country: "PL", vatId: "PL1234567890", reference: "", status: "attention", lastCheckedAt: null, runs: 0, invoices: 0, passed: 0, failed: 0, fixedToPass: 0, stillFailing: 0, passRate: null, topRules: [] }], totals: {} };
  const csv = dashboardCsv(/** @type {any} */ (d), "pl");
  assert.ok(csv.includes("Odsetek poprawnych %"));
  assert.ok(csv.includes("wymaga uwagi"));
});
