import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extract } from "./extract.mjs";

const read = (f) => readFile(new URL(f, import.meta.url), "utf8");
const index = await read("./index.html");
const guide = await read("./how-to-write-meeting-action-items.html");

test("the entry page is a working tool wired to the shared engine", () => {
  for (const id of ["notes", "date", "people", "run", "dl-csv", "dl-ics", "copy-email"]) assert.match(index, new RegExp(`id="${id}"`));
  assert.match(index, /from "\.\/extract\.mjs"/);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /FAQPage/);
});

test("both JSON-LD blocks parse", () => {
  for (const html of [index, guide]) {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length >= 1);
    for (const b of blocks) assert.doesNotThrow(() => JSON.parse(b[1]));
  }
});

test("disclaimers, privacy and usage opt-out are present", () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never leaves your device/i);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
  assert.match(index, /What you use today/);
});

test("the page makes no network calls", () => {
  assert.doesNotMatch(index.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the guide's worked example is what the engine produces", () => {
  const raw = /<pre id="raw">([\s\S]*?)<\/pre>/.exec(guide)[1].replace(/&amp;/g, "&");
  const r = extract(raw, { date: "2026-10-19" });
  const rows = [...guide.matchAll(/<tr><td>(?:<em>)?([^<]*)(?:<\/em>)?<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(rows, r.actions.map((a) => [a.owner || "needs an owner", a.task, a.due || "none given"]));
  assert.equal(r.decisions[0].text, "Keep the free tier through December");
  assert.equal(r.questions[0].text, "Who owns the refund policy wording?");
});

test("links to its siblings", () => {
  assert.match(index, /href="\.\.\/shift-roster-builder\/"/);
  assert.match(index, /href="\.\.\/league-schedule-generator\/"/);
});
