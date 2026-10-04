import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { diff } from "./engine.mjs";

const DOCS = "how-to-regression-test-prompts-when-switching-llm-models.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty and FAQ data; index carries sponsor, privacy and opt-out", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded/i);
  assert.match(idx, /id="optout"/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page's worked example runs through the engine and shows each failure class (dogfooding)", async () => {
  const page = await read("index.html");
  const grab = (name) => {
    const m = new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n    \\]);`).exec(page);
    assert.ok(m, `expected ${name} in index.html`);
    return JSON.stringify(eval(m[1]).map((x) => x)).replace(/^\[|\]$/g, "").split("},{").join("}\n{").replace(/^\{?/, "{").replace(/\}?$/, "}");
  };
  const r = diff(grab("EXAMPLE_BASE"), grab("EXAMPLE_CAND"));
  assert.equal(r.inputErrors.length, 0);
  const rules = r.cases.flatMap((c) => c.findings.map((f) => f.rule));
  for (const rule of ["json-broken", "new-refusal", "format-lost"]) assert.ok(rules.includes(rule), rule);
  assert.equal(r.summary.clean, 1);
});

test("index links one hop to the sibling LLM tools", async () => {
  const idx = await read("index.html");
  for (const slug of ["llm-api-pricing-calculator", "llm-usage-log-analyzer", "llm-call-cost-scan", "ai-coding-plan-cost-calculator"]) assert.match(idx, new RegExp(`href="\\.\\./${slug}/"`));
});
