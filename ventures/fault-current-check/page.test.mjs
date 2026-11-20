import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "nec-110-24-available-fault-current-label.html"];
const fa = (n) => Math.round(n).toLocaleString("en-US");

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not engineering, electrical, legal or code-compliance advice/, p);
    assert.match(html, /Not affiliated with any equipment or fuse manufacturer/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD blocks parse and every FAQ matches the visible questions", () => {
  for (const p of PAGES) {
    const html = page(p);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq, p);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
  }
  const app = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]))[0];
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("SEO basics on every page", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /<title>[^<]{20,}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,320}"/, p);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${p.replace(/\./g, "\\.")}">`), p);
    assert.match(html, /<meta property="og:title"/, p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(html, /<html lang="en">/, p);
    assert.match(page("sitemap.xml"), new RegExp(p.replace(/\./g, "\\.")));
  }
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !t.includes("${"));
  assert.ok(inputs.length >= 18);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const t of html.matchAll(/<(input|select) [^>]*data-k[^>]*>/g)) assert.match(t[0], /aria-label=/);
  for (const f of [...PAGES, "calc.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s|import\(|Date\.now|Math\.random|new Date/m);
});

test("the inline script imports only exported names, and its fields are the engine's", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const calc = await import("./calc.mjs");
  for (const n of html.match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim())) assert.ok(calc[n] !== undefined, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const keys = html.match(/const KEYS = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
  const engineKeys = Object.keys(calc.sampleInput()).filter((k) => !["segments", "serviceName"].includes(k));
  assert.deepEqual([...keys].sort(), engineKeys.sort());
  for (const k of keys) assert.ok(ids.has(k), `field ${k}`);
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  const cols = html.match(/const COLS = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
  for (const s of calc.sampleInput().segments) for (const k of Object.keys(s)) assert.ok(cols.includes(k), k);
});

test("the guide's and FAQ's worked numbers are the engine's", async () => {
  const { analyze, sampleInput } = await import("./calc.mjs");
  const x = sampleInput();
  const a = analyze(x), plain = analyze({ ...x, tolerancePct: "0", motorFla: "" });
  const g = page("nec-110-24-available-fault-current-label.html");
  const names = ["Service", "MDP", "LP-1", "LP-2 (208 V)"];
  a.nodes.forEach((n, i) => {
    const row = `<tr><td>${names[i]}</td><td class="n">${fa(plain.nodes[i].amps)} A</td><td class="n">${fa(n.amps)} A</td><td class="n">${fa(n.ampsP2P)} A</td><td class="n">${n.ratingKa} kA</td></tr>`;
    assert.ok(g.includes(row), row);
  });
  assert.ok(g.includes(`<strong>${fa(a.nodes[0].amps)} A</strong> at the service`));
  assert.ok(g.includes(`<strong>${a.nodes[0].labelA.toLocaleString("en-US")} A</strong>`));
  assert.ok(g.includes(`<strong>${fa(a.source.infiniteBusA)} A</strong>`));
  assert.ok(g.includes(`<strong>${a.nodes[2].p2pLowPct.toFixed(1)} % higher</strong>`));
  assert.ok(g.includes(`(${a.nodes[1].p2pLowPct.toFixed(1)} % at the MDP)`));
  assert.ok(g.includes(`about ${a.nodes[2].segment.rPer1000ft.toFixed(3)} ohm resistance against ${a.nodes[2].segment.xPer1000ft.toFixed(3)} ohm reactance`));
  const lp2 = Math.round(((a.nodes[3].amps - plain.nodes[3].amps) / plain.nodes[3].amps) * 100);
  assert.ok(g.includes(`moves ${lp2} %`));
  assert.ok(page("index.html").includes(`magnitude sum reads ${a.nodes[2].p2pLowPct.toFixed(1)} percent low`));
});

test("page documents the method, omissions and usage events", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  for (const e of ["fault_calculated", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# Available Fault Current Calculator/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: fault-current-check$/m);
});
