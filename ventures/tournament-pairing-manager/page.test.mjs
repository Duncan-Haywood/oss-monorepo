import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parsePlayers, sampleFields, pairSwissRound, swissStandings } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-run-a-swiss-tournament.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any chess federation/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /not an implementation of any federation's official pairing rules/);
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
  const app = JSON.parse(page("index.html").match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Tournament Pairing Manager/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /swiss pairing generator/i);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 10);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
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
  assert.ok(used.length > 25);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["tournament_started", "example_loaded", "round_paired", "file_saved", "csv_downloaded", "text_shared"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE and VENTURE.yaml exist and carry the screening notes", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  const y = page("VENTURE.yaml");
  assert.match(y, /^name: tournament-pairing-manager$/m);
  assert.match(y, /duplicate_check\.py/);
  assert.match(y, /No payments, no accounts/);
});

test("related-tool links point at ventures that exist, and the sibling links resolve", () => {
  for (const name of ["index.html", GUIDE]) {
    for (const m of page(name).matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(existsSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);
  }
  assert.match(page("index.html"), /href="\.\/how-to-run-a-swiss-tournament\.html"/);
  assert.match(page("sitemap.xml"), /how-to-run-a-swiss-tournament\.html/);
});

test("the guide's worked example matches the pairing engine", () => {
  const guide = page(GUIDE);
  assert.match(guide, /No warranty/);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, /<link rel="canonical" href="\.\/how-to-run-a-swiss-tournament\.html">/);
  const { players } = parsePlayers(sampleFields().players);
  const first = (id) => players.find((p) => p.id === id).name.split(" ")[0];
  const rounds = [];
  for (let r = 0; r < 3; r++) {
    const p = pairSwissRound(players, rounds, { colours: true });
    rounds.push({ pairings: p.pairings.map((x, i) => ({ ...x, result: r === 1 && i === 3 ? "draw" : Number(x.a.slice(1)) < Number(x.b.slice(1)) ? "a" : "b" })), byes: p.byes });
  }
  for (const r of rounds) {
    r.pairings.forEach((p, i) => {
      const res = p.result === "a" ? "1-0" : p.result === "b" ? "0-1" : "1/2-1/2";
      assert.ok(guide.includes(`<tr><td>${i + 1}</td><td>${first(p.a)}</td><td>${first(p.b)}</td><td>${res}</td></tr>`), `${first(p.a)} v ${first(p.b)}`);
    });
  }
  for (const s of swissStandings(players, rounds)) {
    assert.ok(guide.includes(`<tr><td>${s.rank}</td><td>${s.name.split(" ")[0]}</td><td>${s.score}</td><td>${s.buchholz}</td></tr>`), s.name);
  }
});
