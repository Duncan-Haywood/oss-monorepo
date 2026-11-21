// The guide pages: linked from the tool page and sitemap, FAQ markup equal to
// the visible questions, the disclaimer present, and every number the worked
// examples quote equal to what the engine computes on the built-in example.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { EXAMPLE_XER, EXAMPLE_PREV_XER } from "./example.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDES = [
  "how-to-run-a-dcma-14-point-schedule-assessment.html",
  "how-to-open-an-xer-file-without-primavera-p6.html",
  "how-to-convert-a-p6-xer-file-to-microsoft-project.html",
  "how-to-review-a-contractors-p6-schedule-update.html",
];

test("every guide is linked from the tool page, the sitemap and llms.txt", () => {
  for (const g of GUIDES) {
    assert.ok(page("index.html").includes(`href="./${g}"`), g);
    assert.ok(page("sitemap.xml").includes(`<loc>./${g}</loc>`), g);
    assert.ok(page("llms.txt").includes(`/xer-schedule-check/${g})`), g);
  }
});

test("each guide: canonical, title and description lengths, FAQ markup equals the visible text, disclaimer", () => {
  for (const g of GUIDES) {
    const html = page(g);
    assert.ok(html.includes(`<link rel="canonical" href="./${g}">`), g);
    const title = html.match(/<title>(.*?)<\/title>/)[1];
    assert.ok(title.length <= 70, `${g} title ${title.length}`);
    const desc = html.match(/<meta name="description" content="(.*?)">/)[1];
    assert.ok(desc.length >= 60 && desc.length <= 160, `${g} description ${desc.length}`);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(ld["@type"], "FAQPage");
    for (const q of ld.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
    assert.match(html, /No warranty/);
    assert.match(html, /not engineering, legal, contractual or scheduling advice/);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
    for (const other of GUIDES) if (other !== g) assert.ok(html.includes(`href="./${other}"`), `${g} -> ${other}`);
  }
});

test("the buttons the guides name exist on the tool page", () => {
  const index = page("index.html");
  for (const label of ["Load an example schedule", "Load an example pair of updates", "Download for Microsoft Project (.xml)", "write activity code descriptions too"]) {
    assert.ok(index.includes(label), label);
  }
});

const dir = mkdtempSync(join(tmpdir(), "xer-guides-"));
writeFileSync(join(dir, "cur.xer"), EXAMPLE_XER);
writeFileSync(join(dir, "prev.xer"), EXAMPLE_PREV_XER);
const cli = (...args) => JSON.parse(execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...args, "--json"], { encoding: "utf8" }));

test("the DCMA guide's worked example equals the engine on the built-in example", () => {
  const html = page(GUIDES[0]);
  const r = cli(join(dir, "cur.xer"));
  const c = (id) => r.checks.find((x) => x.id === id);
  const r1 = (v) => Math.round(v * 10) / 10;
  assert.equal(r.checks.filter((x) => x.pass).length, 6);
  assert.match(html, /It passes 6 of 14/);
  assert.equal(c(1).count, 2); assert.equal(c(1).total, 19); assert.equal(r1(c(1).value), 10.5);
  assert.match(html, /Fail, 10\.5% \(2 of 19\)/);
  assert.equal(c(2).count, 1);
  assert.equal(c(3).count, 4); assert.equal(c(3).total, 23); assert.equal(r1(c(3).value), 17.4);
  assert.match(html, /Fail, 17\.4% \(4 of 23\)/);
  assert.equal(c(5).count, 1); assert.equal(r1(c(5).value), 5.3);
  assert.equal(c(8).count, 1); assert.equal(c(8).total, 18);
  assert.equal(c(10).count, 2); assert.equal(c(10).total, 18);
  assert.equal(c(11).count, 3); assert.equal(c(11).total, 4); assert.equal(c(14).value, 0.5);
  assert.ok(c(12).pass); assert.equal(c(12).value, 600);
  assert.equal(c(13).value, 1.051);
  assert.match(html, /Pass, 1\.051/);
  for (const id of [4, 6, 7, 9]) assert.ok(c(id).pass, `check ${id}`);
});

test("the update-review guide's worked example equals the comparison engine", () => {
  const html = page(GUIDES[3]);
  const r = cli(join(dir, "cur.xer"), "--previous", join(dir, "prev.xer"));
  assert.equal(r.finish.moved, 15);
  assert.equal(r.finish.progressEffect, 8);
  assert.equal(r.finish.revisionEffect, 7);
  assert.match(html, /\+15 working days: progress \+8, revisions \+7/);
});
