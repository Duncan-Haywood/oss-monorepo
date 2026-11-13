import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, sampleInput, money, MAX_HEIRS } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-divide-personal-property-among-heirs.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial or appraisal advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any law firm/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(page(GUIDE), /No warranty/);
});

test("JSON-LD blocks parse and every FAQ question is on the page", () => {
  for (const name of ["index.html", GUIDE]) {
    const html = page(name);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, name);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
  }
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Estate Item Divider/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(page("sitemap.xml"), new RegExp(GUIDE.replace(/\./g, "\\.")));
  assert.match(page("llms.txt"), new RegExp(GUIDE.replace(/\./g, "\\.")));
});

test("nothing is sent anywhere and static inputs are labelled", () => {
  const html = page("index.html");
  const staticHtml = html.replace(/<script type="module">[\s\S]*?<\/script>/, "");
  for (const tag of staticHtml.matchAll(/<(input|select)\b[^>]*>/g)) {
    const t = tag[0];
    const id = t.match(/\sid="([^"]+)"/)?.[1];
    if (/type="checkbox"/.test(t)) continue; // wrapped by its own <label>
    if (/type="file"/.test(t)) { assert.match(t, /aria-label=/); continue; }
    assert.ok(id && new RegExp(`<label[^>]*for="${id}"`).test(html), `unlabelled: ${t}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
});

test("the heirs selector covers exactly what the engine supports", () => {
  const opts = page("index.html").match(/<select id="count">(.*?)<\/select>/s)[1].match(/<option[^>]*>(\d+)/g).map((o) => Number(o.replace(/\D/g, "")));
  assert.equal(Math.min(...opts), 2);
  assert.equal(Math.max(...opts), MAX_HEIRS);
});

test("the guide's three worked tables are the engine's answers", () => {
  const html = page(GUIDE);
  const cash = solve(sampleInput());
  for (const r of cash.rows) {
    const row = `<tr><td>${r.heir}</td><td>${r.items.join(", ")}</td><td>${money(r.itemsValue)}</td><td>${r.payment > 0 ? "receives " : "pays "}${money(Math.abs(r.payment))}</td><td>${money(r.total)}</td><td>${money(r.fairShare)}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  assert.ok(html.includes(`ends ${money(cash.margin)} above`));
  const items = solve({ ...sampleInput(), mode: "items" });
  assert.ok(items.proven && !items.envyFree && items.ef1);
  for (const r of items.rows) {
    const row = `<tr><td>${r.heir}</td><td>${r.items.join(", ")}</td><td>${money(r.itemsValue)}</td><td>${Math.round(r.percentOfOwn * 1000) / 10}%</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  const k = solve({ ...sampleInput(), equalShares: false, heirs: sampleInput().heirs.map((h, i) => ({ ...h, share: [50, 25, 25][i] })) });
  assert.ok(html.includes(`the ${money(k.surplus)} left over`));
  for (const r of k.rows) {
    const row = `<tr><td>${r.heir}</td><td>${r.share * 100}%</td><td>${r.items.join(", ")}</td><td>${r.payment > 0 ? "receives " : "pays "}${money(Math.abs(r.payment))}</td><td>${money(r.total)}</td><td>${money(r.fairShare)}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  // The input table is the sample input.
  for (const [j, it] of sampleInput().items.entries()) {
    assert.ok(html.includes(`<tr><td>${it}</td>${sampleInput().heirs.map((h) => `<td>${money(h.values[j])}</td>`).join("")}</tr>`), it);
  }
});
