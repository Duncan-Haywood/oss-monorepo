import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not a design review, a code-compliance check or professional advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every file input has a label, and the page only fetches its own files", () => {
  const html = page("index.html");
  for (const id of ["ifc", "ids"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  for (const m of html.matchAll(/fetch\(([^)]*)\)/g)) assert.match(m[1], /^"(samples|\.\/schema)\//, m[1]);
  assert.doesNotMatch(html, /XMLHttpRequest|sendBeacon/);
  for (const m of page("worker.mjs").matchAll(/fetch\(([^)]*)\)/g)) assert.match(m[1], /new URL\("\.\/schema\//);
});

test("the page and worker import modules that exist and never a Node-only one", () => {
  const seen = new Set();
  const walk = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const src = page(name);
    assert.doesNotMatch(src, /from "node:/, `${name} must run in a browser`);
    for (const m of src.matchAll(/from "\.\/([a-z0-9-]+\.mjs)"/g)) walk(m[1]);
  };
  const html = page("index.html");
  for (const m of html.matchAll(/from "\.\/([a-z0-9-]+\.mjs)"/g)) walk(m[1]);
  // Modules the page loads on first use, import("./x.mjs"), must exist and run in a browser too.
  for (const m of html.matchAll(/import\("\.\/([a-z0-9-]+\.mjs)"\)/g)) walk(m[1]);
  walk("worker.mjs");
  assert.ok(seen.has("ids.mjs") && seen.has("bcf.mjs") && seen.has("spec-doc.mjs") && seen.has("excel2ids.mjs"));
});

test("a first visit loads only the usage counter and the zip reader; the rest waits for a file or a button", () => {
  // docs/history/ids-model-check-page-perf-2026-11-25.md: the static imports
  // were 164 kB gzip (the IDS parser and model readers, which the worker loads
  // for itself), and nothing used them before a file was chosen.
  const html = page("index.html");
  const statics = [...html.matchAll(/^\s*import [^;]*? from "\.\/([a-z0-9-]+\.mjs)";/gm)].map((m) => m[1]).sort();
  assert.deepEqual(statics, ["usage.mjs", "zip.mjs"]);
  for (const f of ["report.mjs", "html-report.mjs", "bcf.mjs", "fix.mjs", "bsdd-suggest.mjs", "sheet.mjs", "excel2ids.mjs", "spec-doc.mjs"]) {
    assert.ok(html.includes(`import("./${f}")`), `${f} loads on first use`);
  }
});

test("the in-page FAQ matches the structured data", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name + " answer");
  }
});

test("robots, sitemap and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("llms.txt"), /IDS/);
});

test("links its sibling submittal-register (crawlable pair, platform/pages/siblings.mjs)", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/submittal-register\/"/);
});

test("an IFC4/IFC4X3 STEP result offers the model as ifcXML, written in the worker", () => {
  const html = page("index.html");
  assert.match(html, /id="as-ifcxml-go"/);
  assert.match(html, /asIfcXml: state.ifcName/);
  assert.match(html, /record\("as_ifcxml_downloaded"\)/);
  const w = page("worker.mjs");
  assert.match(w, /if \(asIfcXml\)/);
  assert.match(w, /ifcxml-layout-\$\{target\.toLowerCase\(\)\}\.json/);
});
