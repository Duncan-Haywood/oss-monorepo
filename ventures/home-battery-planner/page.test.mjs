import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "self-powered-vs-time-based.html"];

test("pages carry the disclaimer and sponsor link; the tool page the privacy line", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not legal, tax, accounting, compliance, engineering, or financial advice/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
    assert.match(html, /<script type="application\/ld\+json">/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("every input has a label and nothing can send data anywhere", () => {
  const html = page("index.html");
  for (const id of [...html.matchAll(/<(?:input|textarea|select) id="([^"]+)"/g)].map((m) => m[1])) assert.match(html, new RegExp(`<label (?:class="sr" )?for="${id}"`), id);
  for (const f of ["index.html", "report.mjs", "meter.mjs", "tariff.mjs", "dispatch.mjs", "example.mjs", "greenbutton.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
});

test("the module script imports only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./example.mjs", "./report.mjs", "./tariff.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("pages state what they do not decide and that the example is a placeholder with invented prices", () => {
  for (const p of PAGES) assert.match(page(p), /Not decided here/, p);
  assert.match(page("index.html"), /synthetic placeholder/);
  assert.match(page("index.html"), /invented prices/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
  const named = [...footer.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(named, [...new Set(recorded)].sort());
});

test("the guide's numbers are the ones check/resstock-results.md holds", () => {
  const html = page("self-powered-vs-time-based.html");
  const res = page("check/resstock-results.md");
  const rowOf = (section, label) => {
    const s = res.slice(res.indexOf(section));
    const line = s.split("\n").find((l) => l.startsWith(`| ${label} |`));
    return line.split("|").slice(2, 5).map((c) => c.trim());
  };
  const money = (c) => (c.startsWith("-") ? "&minus;$" + c.slice(1) : "$" + c);
  for (const [sec, label] of [["## Plan A", "Saving, self-powered ($/yr)"], ["## Plan A", "Saving, time-based ($/yr)"], ["## Plan A", "Saving, perfect-foresight ceiling ($/yr)"], ["## Plan B", "Saving, self-powered ($/yr)"], ["## Plan B", "Saving, time-based ($/yr)"], ["## Plan B", "Saving, perfect-foresight ceiling ($/yr)"]])
    assert.ok(html.includes(rowOf(sec, label).map((c) => `<td class="n">${money(c)}</td>`).join("")), `${sec} ${label}`);
  for (const label of ["Self-powered as a share of the ceiling", "Time-based as a share of the ceiling"])
    assert.ok(html.includes(rowOf("## Plan A", label).map((c) => `<td class="n">${c}</td>`).join("")), label);
  assert.match(res, /Self-powered saved more than time-based in 40 of 40 homes/);
  for (const line of res.slice(res.indexOf("## Plan A")).split("\n").filter((l) => /^\| \d/.test(l)).slice(0, 5)) {
    const c = line.split("|").map((x) => x.trim());
    assert.ok(html.includes(`<td>${c[1]}</td><td class="n">${c[2]}</td><td class="n">${c[3]}</td><td class="n">${c[4]}</td>`), line);
  }
});

test("sitemap lists every page; llms.txt links them", () => {
  for (const p of PAGES) assert.match(page("sitemap.xml"), new RegExp(`<loc>./${p}</loc>`));
  assert.match(page("llms.txt"), /self-powered-vs-time-based\.html/);
});

test("sibling links both ways: the battery page links its neighbours and they link back", () => {
  const html = page("index.html");
  for (const s of ["solar-payback-calculator", "texas-electricity-plan-checker", "demand-charge-interval-analyzer"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
  for (const s of ["solar-payback-calculator", "texas-electricity-plan-checker"]) assert.match(readFileSync(new URL(`../${s}/index.html`, import.meta.url), "utf8"), /href="\.\.\/home-battery-planner\/"/, s);
});
