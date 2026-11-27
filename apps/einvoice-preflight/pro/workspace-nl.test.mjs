// The workspace in Dutch: every page string, the PDF converter, the field labels and the two emails
// have a Dutch version, and Dutch readers get the English legal texts (no Dutch translation exists).
// Proprietary (see ../LICENSE).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { message } from "./email.mjs";
import { formatEuro } from "./web/workspace-lib.mjs";

const js = readFileSync(new URL("./web/app.js", import.meta.url), "utf8");

/** A `const NAME = { ... };` table from app.js, read from the source (app.js needs a DOM to import). @param {string} name */
function table(name) {
  const start = js.indexOf(`const ${name} = {`);
  const end = js.indexOf("\n};\n", start);
  assert.ok(start >= 0 && end > start, `app.js keeps ${name} in \`const ${name} = { ... };\``);
  return /** @type {Record<string, Record<string, string>>} */ (runInNewContext(`(${js.slice(start + `const ${name} = `.length, end + 2)})`));
}

const placeholders = (/** @type {string} */ s) => (s.match(/\{\w+\}/g) ?? []).sort();

for (const name of ["T", "CT", "FIELD_T"]) {
  test(`${name}: Dutch has exactly the English keys, none empty, same placeholders`, () => {
    const tbl = table(name);
    assert.ok(tbl.nl, `${name} has a Dutch table`);
    assert.deepEqual(Object.keys(tbl.nl).sort(), Object.keys(tbl.en).sort());
    for (const [k, v] of Object.entries(tbl.en)) {
      assert.ok(tbl.nl[k].trim(), `nl.${k} is not empty`);
      assert.deepEqual(placeholders(tbl.nl[k]), placeholders(v), `nl.${k} keeps the placeholders`);
    }
  });
}

test("the Dutch page keeps the not-advice line and says the English legal text governs", () => {
  const T = table("T");
  assert.match(T.nl.disclaimer, /geen fiscaal of juridisch advies/);
  assert.match(T.nl.accept, /Engelse tekst is bindend/);
  assert.match(T.nl.accept, /geen fiscaal of juridisch advies/);
});

test("Dutch is offered in the switcher, remembered, and picked from the browser language", () => {
  assert.match(js, /saved === "nl"/);
  assert.match(js, /nav === "nl"/);
  assert.match(js, /\["de", "fr", "en", "nl", "pl"\]\)\.map\(\(l\) =>/);
});

test("legal links: Dutch readers get the English text, not a missing /app/nl/ page", () => {
  assert.match(js, /state\.lang === "de" \|\| state\.lang === "fr" \? `\/app\/\$\{state\.lang\}\/\$\{k\}` : `\/app\/\$\{k\}`/);
});

test("both emails exist in Dutch, keep the link, and neutralise the firm name", () => {
  for (const kind of /** @type {const} */ (["verify", "signin"])) {
    const m = message(kind, "nl", { firm: "Boekhoud\r\nkantoor", link: "https://e.example/app#x=1" });
    assert.match(m.subject, /e-factuurwerkruimte/);
    assert.ok(m.text.includes("https://e.example/app#x=1"));
    assert.ok(!/\r|Boekhoud\nkantoor/.test(m.text), "no header-style line break from the firm name");
    assert.match(m.text, /negeer/);
    assert.notEqual(m.text, message(kind, "en", { firm: "x", link: "y" }).text);
  }
});

test("prices read the Dutch way", () => {
  assert.equal(formatEuro(1900, "nl"), "€ 19");
  assert.equal(formatEuro(4950, "nl"), "€ 49,50");
});
