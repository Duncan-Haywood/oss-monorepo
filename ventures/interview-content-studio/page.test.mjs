import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as S from "./studio.mjs";
import { main } from "./cli.mjs";

const read = (f) => readFile(new URL(f, import.meta.url), "utf8");
const index = await read("./index.html");
const guide = await read("./how-often-to-post-on-each-platform.html");
const sitemap = await read("./sitemap.xml");
const readme = await read("./README.md");

test("the entry page is wired to the shared engine and has every control", () => {
  for (const id of ["interview-select", "new-interview", "q-area", "prev", "next", "mode", "download-state", "import-file", "start-date", "build", "plan-rows", "calendar", "draft-list", "filter", "ai-provider", "ai-model", "ai-base", "ai-key", "ai-remember", "ai-all", "dl-csv", "dl-md", "dl-json", "copy-md", "optout"]) assert.match(index, new RegExp(`id="${id}"`), id);
  for (const m of ["studio", "ai", "byok", "usage"]) assert.match(index, new RegExp(`from "\\./${m}\\.mjs"`));
});

test("JSON-LD parses and the FAQ answers are visible on the page", () => {
  for (const html of [index, guide]) {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length >= 2);
    for (const b of blocks) {
      const data = JSON.parse(b[1]);
      if (data["@type"] !== "FAQPage") continue;
      for (const q of data.mainEntity) {
        assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
        assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
      }
    }
  }
});

test("disclaimers, privacy, posting rules and opt-out are present", () => {
  for (const html of [index, guide]) {
    assert.match(html, /No warranty/);
    assert.match(html, /Best-effort hosting, no SLA/);
    assert.match(html, /sponsors\/Duncan-Haywood/);
  }
  assert.match(index, /does not post anywhere/);
  assert.match(index, /fake accounts or fake reviews/);
  assert.match(index, /key stays in this browser/);
  assert.match(index, /never uploaded/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /Remember these settings and key in this browser/);
});

test("the page script itself makes no network calls (only byok.mjs does, on request)", () => {
  assert.doesNotMatch(index.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("every form control has a label", () => {
  for (const m of index.matchAll(/<(input|select|textarea)\b[^>]*\bid="([^"]+)"/g)) {
    const id = m[2];
    const labelled = index.includes(`for="${id}"`) || new RegExp(`<label>\\s*<input[^>]*id="${id}"`).test(index);
    assert.ok(labelled, `#${id} has no label`);
  }
});

test("the guide's tables are what the engine says", () => {
  for (const p of S.PLATFORMS) for (const id of p.formats) {
    const f = S.FORMATS[id];
    const row = new RegExp(`<tr data-format="${id}"><td>[^<]+</td><td>${f.name}</td><td>${f.floor}</td><td>${f.ideal}</td><td>${f.minutes}</td>`);
    assert.match(guide, row, id);
  }
  const plan = S.planCadence(["linkedin", "instagram", "newsletter"], 3);
  for (const r of plan.rows) {
    assert.match(guide, new RegExp(`<tr data-format="${r.format}"><td>[^<]+</td><td>${r.perMonth}</td><td>${r.perWeek}</td></tr>`), r.format);
    assert.equal(r.status, "between", "the guide says every format is between floor and ideal");
  }
  assert.match(guide, new RegExp(`<strong id="example-minutes">${plan.usedPerWeek}</strong>`));
  const byCost = [...plan.rows].sort((a, b) => a.minutes - b.minutes).map((r) => r.format);
  assert.deepEqual(byCost.slice(0, 2), ["linkedin-post", "instagram-feed"], "the guide names LinkedIn then Instagram feed as next in line");
});

test("sitemap lists every page; README links the live page", () => {
  assert.match(sitemap, /index\.html/);
  assert.match(sitemap, /how-often-to-post-on-each-platform\.html/);
  assert.match(readme, /https:\/\/duncan-haywood\.github\.io\/oss-monorepo\/interview-content-studio\//);
  assert.match(readme, /No warranty/);
});

test("CLI: questions, plan, csv, md, json and bad input", async () => {
  const out = [], err = [];
  const state = { version: 1, interviews: [{ id: "b1", topic: "Bakery launch", createdAt: "2026-10-20", answers: { about: "I bake sourdough for cafes.", stories: ["We lost a client. I fixed the route. Reliability sells."], platforms: ["x", "linkedin"], hours: 2 } }], activeId: "b1", startDate: "2026-11-02" };
  const io = (files = {}) => ({ log: (s) => out.push(s), err: (s) => err.push(s), read: async (f) => { if (!(f in files)) throw new Error("ENOENT"); return files[f]; }, today: "2026-10-20" });
  const files = { "s.json": JSON.stringify(state), "bad.json": "{nope" };
  assert.equal(await main(["--questions"], io()), 0);
  assert.match(out.join("\n"), /stories/);
  out.length = 0;
  assert.equal(await main(["s.json", "--format", "plan"], io(files)), 0);
  assert.match(out.join("\n"), /LinkedIn post/);
  out.length = 0;
  assert.equal(await main(["s.json", "--start", "2026-11-02", "--format", "csv"], io(files)), 0);
  assert.match(out[0], /^date,platform,format,title,text/);
  assert.match(out[0], /2026-11-0\d,X,Post,/);
  out.length = 0;
  assert.equal(await main(["s.json", "--interview", "bakery launch"], io(files)), 0);
  assert.match(out.join("\n"), /# Content plan: Bakery launch/);
  out.length = 0;
  assert.equal(await main(["s.json", "--format", "json"], io(files)), 0);
  assert.equal(JSON.parse(out.join("")).tool, "interview-content-studio");
  assert.equal(await main([], io()), 2);
  assert.equal(await main(["bad.json"], io(files)), 2);
  assert.equal(await main(["missing.json"], io(files)), 2);
  assert.equal(await main(["s.json", "--start", "tomorrow"], io(files)), 2);
  assert.equal(await main(["s.json", "--interview", "nope"], io(files)), 2);
  assert.equal(await main(["s.json", "--format", "pdf"], io(files)), 2);
});
