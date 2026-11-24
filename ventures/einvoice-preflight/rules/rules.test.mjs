import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { LANGS, SOURCES, loadRules, official, officialChecks, renderAll, slugOf } from "./build.mjs";

const here = new URL("./", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("../plain/manifest.json", import.meta.url), "utf8"));
const rules = loadRules();

test("every cited source version is the one the compiled rule sets were built from", () => {
  for (const [key, src] of Object.entries(SOURCES)) {
    for (const set of src.sets) {
      assert.equal(manifest.sets[set]?.commit, src.commit, `${key}: plain/${set}.json was rebuilt from another commit; update SOURCES.${key} (version, url, commit) in rules/build.mjs`);
    }
  }
});

test("every rule id exists in the official rule set version its page cites", () => {
  const missing = rules.filter((r) => !SOURCES[r.source] || !SOURCES[r.source].sets.some((set) => officialChecks(set).has(r.id)));
  assert.deepEqual(missing.map((r) => `${r.id} (${r.source}, ${r.file})`), []);
});

test("covers the whole BR-DE set and at least 30 EN 16931 / Peppol rules", () => {
  const ids = new Set(rules.map((r) => r.id));
  const brde = new Set();
  for (const set of SOURCES.xrechnung.sets) for (const id of officialChecks(set).keys()) if (id.startsWith("BR-DE-")) brde.add(id);
  assert.ok(brde.size >= 35, `expected the XRechnung set to have many BR-DE rules, found ${brde.size}`);
  assert.deepEqual([...brde].filter((id) => !ids.has(id)).sort(), []);
  assert.ok(rules.filter((r) => r.source !== "xrechnung").length >= 30);
  assert.equal(ids.size, rules.length, "a rule id is listed twice");
});

test("every rule has a complete explanation in English, German and French", () => {
  for (const r of rules) {
    assert.ok(Array.isArray(r.terms), `${r.id}: terms`);
    for (const lang of LANGS) {
      const c = r[lang];
      assert.ok(c, `${r.id}: no ${lang}`);
      for (const k of ["title", "meaning"]) assert.ok(typeof c[k] === "string" && c[k].trim().length > 5, `${r.id}/${lang}: ${k}`);
      assert.ok(!c.title.includes(r.id), `${r.id}/${lang}: the title must not repeat the id`);
      for (const k of ["causes", "fix"]) assert.ok(Array.isArray(c[k]) && c[k].length >= 2 && c[k].length <= 5 && c[k].every((x) => x.trim()), `${r.id}/${lang}: ${k}`);
    }
    // The three languages are not copies of each other.
    assert.notEqual(r.en.meaning, r.de.meaning, `${r.id}: German meaning is the English one`);
    assert.notEqual(r.en.meaning, r.fr.meaning, `${r.id}: French meaning is the English one`);
  }
});

/** Strict-enough well-formedness for a fragment: balanced tags, quoted attributes, no bare & or <. */
function wellFormed(xml) {
  const stack = [];
  const tokens = xml.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || [];
  for (const tok of tokens) {
    if (tok.startsWith("<!--")) continue;
    if (tok.startsWith("<")) {
      const m = tok.match(/^<(\/?)([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)((?:\s+[\w.:-]+="[^"<]*")*)\s*(\/?)>$/);
      if (!m) return `bad tag ${tok}`;
      const [, close, name, attrs, self] = m;
      if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(attrs)) return `bare & in ${tok}`;
      if (close) { if (stack.pop() !== name) return `unbalanced </${name}>`; }
      else if (!self) stack.push(name);
    } else if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(tok)) return `bare & in text "${tok.trim().slice(0, 40)}"`;
  }
  return stack.length ? `unclosed <${stack.at(-1)}>` : null;
}

test("every XML snippet is a well-formed fragment in the syntax it is labelled", () => {
  assert.equal(wellFormed("<a><b>x</a>"), "unbalanced </a>");
  assert.equal(wellFormed("<a>R&D</a>"), 'bare & in text "R&D"');
  for (const r of rules) {
    assert.ok(r.ubl || r.cii, `${r.id}: no snippet`);
    for (const x of [r.ubl, r.cii].filter(Boolean)) assert.doesNotMatch(x.replace(/<!--[\s\S]*?-->/g, ""), /\.\.\.|…/, `${r.id}: an elision outside a comment would be copied into a file`);
    if (r.ubl) {
      assert.equal(wellFormed(r.ubl), null, `${r.id} UBL`);
      assert.ok(/<(cbc|cac):/.test(r.ubl) && !/<(ram|rsm|udt):/.test(r.ubl), `${r.id}: UBL snippet uses CII prefixes`);
    }
    if (r.cii) {
      assert.equal(wellFormed(r.cii), null, `${r.id} CII`);
      assert.ok(/<(ram|rsm):/.test(r.cii) && !/<(cbc|cac):/.test(r.cii), `${r.id}: CII snippet uses UBL prefixes`);
    }
  }
});

const pages = renderAll();

test("the committed pages are what rules/build.mjs writes (run `node rules/build.mjs`)", () => {
  for (const [p, html] of pages) assert.equal(fs.readFileSync(new URL(p, here), "utf8"), html, p);
  for (const lang of LANGS) {
    const onDisk = fs.readdirSync(new URL(`${lang}/`, here)).filter((f) => f.endsWith(".html")).length;
    assert.equal(onDisk, rules.length + 1, `${lang}/ holds a page no rule writes`);
  }
});

test("each page quotes the official message, cites and links its source, links the checker and early access, and carries the disclaimer", () => {
  for (const r of rules) {
    const off = official(r);
    assert.ok(off.messages.length && off.syntaxes.length && off.flag, r.id);
    for (const lang of LANGS) {
      const html = pages.find(([p]) => p === `${lang}/${slugOf(r.id)}.html`)[1];
      const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      for (const m of off.messages) assert.ok(html.includes(esc(m)), `${r.id}/${lang}: official message`);
      assert.ok(html.includes(SOURCES[r.source].url) && html.includes(SOURCES[r.source].version), `${r.id}/${lang}: source`);
      assert.ok(html.includes('href="../../index.html"'), `${r.id}/${lang}: checker link`);
      assert.ok(html.includes("industries/e-invoicing/"), `${r.id}/${lang}: early access link`);
      assert.match(html, /(Not tax or legal advice|Keine Steuer- oder Rechtsberatung|Ni conseil fiscal)/);
      assert.match(html, /(early access|früher Zugang|accès anticipé)/i);
      assert.match(html, new RegExp(`<html lang="${lang}">`));
      for (const l of LANGS) assert.ok(html.includes(`hreflang="${l}" href="https://example.invalid/einvoice-preflight/rules/${l}/${slugOf(r.id)}"`), `${r.id}/${lang}: hreflang ${l}`);
      assert.doesNotMatch(html, /[$€]\s?\d/, `${r.id}/${lang}: no price claims`);
    }
  }
});

test("titles fit in 70 characters and FAQ markup matches the visible questions", () => {
  for (const [p, html] of pages) {
    const title = html.match(/<title>([^<]*)<\/title>/)[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    assert.ok([...title].length <= 70, `${p}: ${title}`);
    const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    if (!ld) { assert.equal(p, "index.html"); continue; }
    for (const q of JSON.parse(ld[1]).mainEntity) assert.ok(html.includes(`<h2>${q.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}</h2>`), `${p}: ${q.name}`);
  }
});
