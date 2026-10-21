import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not engineering, electrical or safety advice/i);
  assert.match(html, /Spinning mower blades can cause serious injury/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Nothing you type or draw is uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any lawn mower or robotic mower maker/);
  assert.match(html, /no robot has been built yet/i);
});

test("JSON-LD parses and the FAQ matches the visible questions", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), `visible answer differs: ${q.name}`);
  }
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Open Robot Mower — DIY robot lawn mower/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
});

test("every input is labelled and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 7);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`for="${id}"`)), `unlabelled: ${tag}`);
  }
  for (const f of ["index.html", "sim.mjs", "usage.mjs"]) {
    assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  }
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("module script imports only local files, and only names they export", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./sim.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  for (const m of src.matchAll(/import \{([^}]+)\} from "\.\/([^"]+)"/g)) {
    const mod = await import(`./${m[2]}`);
    for (const name of m[1].split(",").map((s) => s.trim())) assert.ok(name in mod, `${m[2]} does not export ${name}`);
  }
});

test("the numbers the page quotes are what the models give", () => {
  const html = page("index.html");
  const ref = JSON.parse(page("fixtures/reference.json"));
  const watts = ref.budget_flat.reduce((a, b) => a + b, 0);
  assert.match(html, new RegExp(`<td class="n">${Math.round(watts)} W</td>`));
  assert.match(html, new RegExp(`about ${Math.round(watts)} W while cutting`));
});

test("the manufacturing packages the page offers are committed next to it", () => {
  const html = page("index.html");
  for (const robot of ["mower", "dock"]) {
    // Absolute: the apex mirror serves only pages and scripts.
    assert.match(html, new RegExp(`href="https://github\\.com/duncan-haywood/oss-monorepo/raw/main/ventures/open-robot-mower/manufacturing/${robot}-package\\.zip"`));
    assert.ok(existsSync(new URL(`./manufacturing/${robot}-package.zip`, import.meta.url)));
    assert.ok(existsSync(new URL(`./manufacturing/${robot}/bom.csv`, import.meta.url)));
  }
});

test("hardware links on the page point at files that exist", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/ventures\/open-robot-mower\/((?:hardware|firmware|cad)\/[^"#]+)"/g)) {
    assert.ok(existsSync(new URL(`./${m[1]}`, import.meta.url)), m[1]);
  }
});

test("the build cost the page quotes is the bills of materials' total", () => {
  const rows = (f) => page(f).split("\n").filter((l) => l && !l.startsWith("#")).slice(1).map((l) => {
    const c = l.split(",");
    return { qty: Number(c[1]), usd: Number(c[c.length - 2]), notes: c[c.length - 1] };
  });
  const sum = (rs) => rs.reduce((t, r) => t + r.qty * r.usd, 0);
  const dock = rows("hardware/bom-dock-and-base.csv");
  const base = dock.filter((r) => r.notes.startsWith("base station"));
  const robot = sum(rows("hardware/bom-mower.csv")) + sum(dock) - sum(base);
  const to50 = (x) => Math.round(x / 50) * 50;
  const html = page("index.html");
  assert.ok(html.includes(`roughly ${to50(robot).toLocaleString("en-US")} US dollars for the mower and dock`), `mower + dock ${robot}`);
  assert.ok(html.includes(`about ${to50(sum(base))} for an RTK base station`), `base ${sum(base)}`);
});

// One-hop sibling link (platform/pages/siblings.mjs): the related-tool strip
// rotates and may never pair the open-hardware robot pages.
test("index links one hop to the open-tennis-robots sibling", () => {
  assert.match(page("index.html"), /href="\.\.\/open-tennis-robots\/"/);
});

test("index links one hop to the open-floor-robots sibling", () => {
  assert.match(page("index.html"), /href="\.\.\/open-floor-robots\/"/);
});
