import { test } from "node:test";
import assert from "node:assert/strict";
import { proposal } from "./bidletter.mjs";
import { bidPackageHtml, cleanLogo, cleanAccent } from "./bidpackage.mjs";

// Property test: the branded bid package never lets typed markup through, never
// shows a unit price in the quantities appendix, leaves Labor and Allowances out
// of the appendix, and only accepts a safe logo and a #rrggbb accent.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (x) => Math.round(x * 100) / 100;
const HOSTILE = ["<script>alert(1)</script>", "A & B", `"quoted"`, "<img src=x onerror=1>", "' onload='x"];
const pick = (rand, a) => a[Math.floor(rand() * a.length)];
const BAD_LOGOS = ["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=", "http://example.com/a.png", "https://user:pw@example.com/a.png", "data:text/html;base64,AAAA", "", "not a url"];
const BAD_ACCENTS = ["red", "#fff", "#12345g", "url(x)", "#123456;}</style><script>", "", "#1234567"];

function budget(rand) {
  const names = ["Lumber", "Sheathing", "Roof", "Labor", "Allowances"].filter(() => rand() < 0.8);
  if (!names.includes("Lumber")) names.push("Lumber");
  const sections = names.map((name) => ({ name, subtotal: r2(1 + rand() * 20000), unpriced: 0 }));
  const lines = sections.map((s, i) => ({ section: s.name, item: rand() < 0.4 ? pick(rand, HOSTILE) : `item ${s.name}`, qty: 1 + i, unit: "ea", unitPrice: 8888.11 + i, amount: s.subtotal }));
  const materials = r2(sections.filter((s) => s.name !== "Labor" && s.name !== "Allowances").reduce((t, s) => t + s.subtotal, 0));
  const total = r2(sections.reduce((t, s) => t + s.subtotal, 0));
  return { lines, sections, materials, tax: 0, contingency: 0, total, bid: 0, unpriced: [] };
}

test("fuzz: bid package escapes text, hides unit prices and drops Labor and Allowances", () => {
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const b = budget(rand);
    const q = proposal(b, { client: pick(rand, HOSTILE), project: pick(rand, HOSTILE) });
    if (!q.ok) { failures.push(`seed ${seed}: proposal refused: ${q.error}`); continue; }
    const brand = {
      company: pick(rand, HOSTILE), address: pick(rand, HOSTILE), phone: pick(rand, HOSTILE),
      email: pick(rand, HOSTILE), licenseNo: pick(rand, HOSTILE),
      logo: rand() < 0.5 ? pick(rand, BAD_LOGOS) : "https://example.com/logo.png",
      accent: rand() < 0.5 ? pick(rand, BAD_ACCENTS) : "#a1B2c3",
    };
    const html = bidPackageHtml(q, b, brand);
    const raw = html.match(/<script|<img src=x|<[^>]*\sonerror=[^>]*|(?:href|src)="javascript:/i);
    if (raw) failures.push(`seed ${seed}: raw markup in output: ${raw[0].slice(0, 80)}`);
    if (/8888\.1\d/.test(html)) failures.push(`seed ${seed}: a unit price reached the page`);
    const appendix = html.split("Quantities from the plans")[1] || "";
    for (const l of b.lines) {
      const hidden = l.section === "Labor" || l.section === "Allowances";
      if (hidden && appendix.includes(`<h3>${l.section}</h3>`)) failures.push(`seed ${seed}: ${l.section} in appendix`);
      if (!hidden && !appendix.includes(`<h3>${l.section}</h3>`)) failures.push(`seed ${seed}: ${l.section} missing from appendix`);
    }
    if (!/<style>[^<]*<\/style>/.test(html) || /<\/style><script/i.test(html)) failures.push(`seed ${seed}: style block broken`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
});

test("fuzz: cleanLogo and cleanAccent only pass safe values", () => {
  for (const v of BAD_LOGOS) assert.equal(cleanLogo(v), "", v);
  assert.equal(cleanLogo("https://example.com/a.png"), "https://example.com/a.png");
  assert.match(cleanLogo("data:image/png;base64,iVBORw0KGgo="), /^data:image\/png/);
  assert.equal(cleanLogo("data:image/png;base64," + "A".repeat(400000)), "");
  for (const v of BAD_ACCENTS) assert.equal(cleanAccent(v), "#1f3a5f", v);
  assert.equal(cleanAccent(" #a1B2c3 "), "#a1B2c3");
});

test("bidPackageHtml falls back to the plain proposal when the proposal is refused", () => {
  const out = bidPackageHtml({ ok: false, error: "unpriced" }, { lines: [] }, { company: "X" });
  assert.equal(typeof out, "string");
});
