import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildLine, parseCargo, planLoad, PRESETS, SYSTEMS, sampleCargo, suggestRestarts } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial or safety advice/i);
  assert.match(html, /not a load-securing, axle-weight or regulatory compliance certificate/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any shipping line/);
  assert.match(html, /no freight rate is stated or implied/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Container Load Planner/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 12);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  // inputs the script creates carry an aria-label too
  const row = html.match(/function rowHtml[\s\S]*?<\/tr>`/)[0];
  const made = [...row.matchAll(/<(input|select)\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(made.length, 9);
  for (const tag of made) assert.match(tag, /aria-label=/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module scripts import only local files, and the inline script parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s/m);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every name the inline script imports is exported by calc.mjs", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const name of names) assert.ok(name in calc, name);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  // ids built as "#" + id in loops
  for (const id of ["cL", "cW", "cH", "cP", "pL", "pW", "pDeck", "pCap", "pTare", "pPay"]) assert.ok(ids.has(id), id);
});

test("page documents the rules and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  assert.match(html, /Packing:/);
  assert.match(html, /extreme-point/);
  assert.match(html, /Lower bound/);
  assert.match(html, /axle and gross weights/);
  assert.match(html, /upright/);
  assert.match(html, /Metric \(cm, kg\)/);
  assert.match(html, /Imperial \(in, lb\)/);
  assert.match(html, /What if I swap\?/);
  assert.match(html, /<canvas id="view-top"/);
  assert.match(html, /<canvas id="view-side"/);
});

test("the swap table prices the load from quotes the visitor types, and states no rate itself", () => {
  const html = page("index.html");
  assert.match(html, /id="rates"/);
  assert.match(html, /priceOptions\(rows, parseRates\(txt\)/);
  assert.doesNotMatch(html, /id="rates"[^>]*value=/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["plan_run", "example_loaded", "report_downloaded", "packet_downloaded", "rates_priced"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: container-load-planner$/m);
});

test("related-tool links point at ventures that exist, and the box optimizer links back", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) {
    assert.ok(existsSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);
  }
  assert.match(html, /href="\.\.\/shipping-box-size-optimizer\/"/);
  const other = readFileSync(new URL("../shipping-box-size-optimizer/index.html", import.meta.url), "utf8");
  assert.match(other, /href="\.\.\/container-load-planner\/"/);
});

test("the example in the page is a real plan that needs more than one container", () => {
  const lines = parseCargo(sampleCargo(SYSTEMS.metric), SYSTEMS.metric).lines;
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const plan = planLoad(lines, PRESETS.find((p) => p.id === "40ft"), { restarts: suggestRestarts(units) });
  assert.equal(plan.unfit.length, 0);
  assert.ok(plan.containersNeeded >= 2);
  assert.ok(plan.leftoverFirst > 0);
});

test("the guide page carries the clauses, links both ways, and its worked example matches the planner", () => {
  const guide = page("how-to-plan-a-container-load.html");
  assert.match(guide, /No warranty/);
  assert.match(guide, /not a load-securing, axle-weight or compliance certificate/i);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, /<link rel="canonical" href="\.\/how-to-plan-a-container-load\.html">/);
  assert.match(guide, /href="\.\/"/);
  assert.match(page("index.html"), /href="\.\/how-to-plan-a-container-load\.html"/);
  assert.match(page("sitemap.xml"), /how-to-plan-a-container-load\.html/);
  const ld = JSON.parse(guide.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "FAQPage");
  for (const q of ld.mainEntity) assert.ok(guide.includes(`<h3>${q.name}</h3>`), q.name);
  for (const m of guide.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(existsSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);

  const M = SYSTEMS.metric;
  const line = (h, kg, qty) => [buildLine({ name: "Euro pallet", l: 120, w: 80, h, weight: kg, qty }, M).line];
  const by = (id) => PRESETS.find((p) => p.id === id);
  // 150 pallets 85 cm tall, 250 kg: two layers in a 40 ft, three in a high cube
  const a = planLoad(line(85, 250, 150), by("40ft"), { restarts: 24 });
  const b = planLoad(line(85, 250, 150), by("40hc"), { restarts: 24 });
  assert.equal(a.firstPacked, 50);
  assert.equal(a.containersNeeded, 3);
  assert.equal(b.firstPacked, 75);
  assert.equal(b.containersNeeded, 2);
  assert.equal(b.containers[0].weight, 18750);
  assert.ok(guide.includes("<td class=\"n\">50</td><td class=\"n\">2</td><td class=\"n\">3</td>"));
  assert.ok(guide.includes("<td class=\"n\">75</td><td class=\"n\">3</td><td class=\"n\">2</td>"));
  // 110 cm pallets: a high cube still holds two layers, 50
  assert.equal(planLoad(line(110, 250, 150), by("40hc"), { restarts: 24 }).firstPacked, 50);
  // 600 kg pallets: the payload stops the first container at floor(26500 / 600) = 44
  const heavy = planLoad(line(110, 600, 70), by("40ft"), { restarts: 24 });
  assert.equal(Math.floor(26500 / 600), 44);
  assert.deepEqual(heavy.containers.map((c) => c.count), [44, 26]);
  assert.deepEqual(heavy.containers.map((c) => c.weight), [26400, 15600]);
  assert.equal(heavy.lowerBound, 2);
  // floors quoted in the FAQs, with the stacking switched off
  const floor = (l, w, id) => planLoad([buildLine({ name: "p", l, w, h: 100, weight: 100, qty: 100, maxLayers: 1, maxTop: 0 }, M).line], by(id), { restarts: 60 }).firstPacked;
  assert.equal(floor(120, 80, "40ft"), 25);
  assert.equal(floor(120, 80, "20ft"), 11);
  assert.ok(floor(121.9, 101.6, "20ft") >= 10);
  assert.ok(floor(121.9, 101.6, "40ft") >= 20);
});

test("page wires the share link to the encoder and reads it back on load", () => {
  const html = page("index.html");
  assert.match(html, /id="share-link"/);
  assert.match(html, /encodeShare\(/);
  assert.match(html, /decodeShare\(location\.hash\)/);
  assert.match(html, /never sent to a server/);
});
