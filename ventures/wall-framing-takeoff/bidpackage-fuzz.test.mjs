import { test } from "node:test";
import assert from "node:assert/strict";
import { proposal } from "./bidletter.mjs";
import { bidPackageHtml, cleanLogo, cleanAccent } from "./bidpackage.mjs";

// Property test: the branded bid package, with hostile typed brand fields and
// quantity lines. Typed markup never reaches the page raw, labor and allowance
// lines and unit prices never appear in the appendix, the logo is only an https
// URL or a raster data URL, the accent is always a #rrggbb colour, and a failed
// proposal still gives a refusal page.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const HOSTILE = ["<script>alert(1)</script>", "<img src=x onerror=1>", `"><svg onload=1>`, "A & B", "'; drop"];
const LOGOS = [
  "https://example.com/logo.png", "http://example.com/logo.png", "javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=",
  "data:image/png;base64,iVBORw0KGgo=", `https://u:p@example.com/x.png`, `https://example.com/a"onerror="1`, "", "not a url",
];
const ACCENTS = ["#aa0000", "red", "#12345", "#12345g", "url(x)", "#abcdef;}</style><script>1</script>", ""];

test("fuzz: bid package escapes typed text, hides prices, and cleans logo and accent", () => {
  const failures = [];
  let issued = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const pick = (a) => a[Math.floor(rand() * a.length)];
    const sections = ["Lumber", "Sheathing", "Roof", "Labor", "Allowances"].filter(() => rand() < 0.7);
    if (!sections.includes("Lumber")) sections.push("Lumber");
    const lines = sections.map((s, i) => ({
      section: s, item: rand() < 0.4 ? pick(HOSTILE) : `item ${i}`, qty: 1 + Math.floor(rand() * 50),
      unit: rand() < 0.3 ? pick(HOSTILE) : "ea", unitPrice: 1234.56 + i, amount: 1234.56 + i,
    }));
    const subs = sections.map((name, i) => ({ name, subtotal: 1234.56 + i, unpriced: 0 }));
    const total = Math.round(subs.reduce((t, s) => t + s.subtotal, 0) * 100) / 100;
    const b = { lines, sections: subs, materials: total, tax: 0, contingency: 0, total, bid: total, unpriced: [] };
    const q = proposal(b, { client: pick(HOSTILE), project: pick(HOSTILE) });
    const brand = {
      company: rand() < 0.7 ? pick(HOSTILE) : undefined, address: rand() < 0.5 ? pick(HOSTILE) : undefined,
      phone: rand() < 0.5 ? pick(HOSTILE) : undefined, email: rand() < 0.5 ? pick(HOSTILE) : undefined,
      licenseNo: rand() < 0.5 ? pick(HOSTILE) : undefined, logo: pick(LOGOS), accent: pick(ACCENTS),
    };
    try {
      const h = bidPackageHtml(q, b, brand);
      if (!q.ok) { if (!/Proposal not issued/.test(h)) failures.push(`seed ${seed}: refusal page missing`); continue; }
      issued++;
      // no tag we did not write: only our own script-free markup
      if (/<script/i.test(h)) failures.push(`seed ${seed}: raw <script>`);
      if (/<img src=x/i.test(h) || /<svg/i.test(h)) failures.push(`seed ${seed}: raw hostile tag`);
      if (/onerror=1>|onload=1>/.test(h.replace(/&quot;|&#39;/g, "")) && /<[^>]*(onerror|onload)=/i.test(h)) failures.push(`seed ${seed}: live event handler`);
      for (const img of h.match(/<img [^>]*>/gi) || []) {
        const src = /src="([^"]*)"/.exec(img);
        if (!src || !(/^https:\/\//.test(src[1]) || /^data:image\/(png|jpeg|webp|gif);base64,/.test(src[1]))) failures.push(`seed ${seed}: bad logo ${img}`);
        if ((img.match(/ on\w+=/gi) || []).length) failures.push(`seed ${seed}: handler on img`);
      }
      const accent = /h1,h2,h3\{color:([^}]*)\}/.exec(h);
      if (!accent || !/^#[0-9a-fA-F]{6}$/.test(accent[1])) failures.push(`seed ${seed}: accent ${accent && accent[1]}`);
      const appendix = h.slice(h.indexOf("Quantities from the plans"));
      if (/1,?23[4-9]\.\d\d|1,?238\.56/.test(appendix.replace(/class="n">\d+</g, ""))) failures.push(`seed ${seed}: unit price in appendix`);
      for (const l of lines) if ((l.section === "Labor" || l.section === "Allowances") && l.item.startsWith("item") && appendix.includes(`>${l.item}<`)) failures.push(`seed ${seed}: ${l.section} line in appendix`);
    } catch (e) {
      failures.push(`seed ${seed}: threw ${e.message}`);
    }
  }
  assert.ok(issued > 250, `only ${issued} issued`);
  assert.deepEqual(failures.slice(0, 5), []);
});

test("cleanLogo and cleanAccent never pass a hostile value through", () => {
  for (const v of LOGOS) {
    const out = cleanLogo(v);
    assert.ok(out === "" || /^https:\/\//.test(out) || /^data:image\/(png|jpeg|webp|gif);base64,/.test(out), v);
    assert.doesNotMatch(out, /@|"|</, v);
  }
  for (const v of ACCENTS) assert.match(cleanAccent(v), /^#[0-9a-fA-F]{6}$/);
  assert.equal(cleanLogo(null), "");
  assert.equal(cleanAccent(undefined), "#1f3a5f");
});
