import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./vr.html", import.meta.url), "utf8");
const script = page.slice(page.indexOf('<script type="module">'));
const voice = await readFile(new URL("./voice.mjs", import.meta.url), "utf8");

test("carries the no-warranty clause, a headset safety line and the sponsor link", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /headset off if you feel unwell/i);
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("discloses every network destination and every usage event", () => {
  assert.match(page, /never uploaded/i);
  assert.match(page, /browser maker's speech service/);
  assert.match(page, /cdn\.jsdelivr\.net/);
  assert.match(page, /huggingface\.co/);
  for (const [, name] of script.matchAll(/record\("([a-z_]+)"\)/g)) {
    assert.match(page, new RegExp(`<code>${name}</code>`), `${name} is recorded but not disclosed`);
  }
});

test("only fetches GitHub API URLs built by the engine", () => {
  const calls = [...script.matchAll(/fetch\(([^,)]+\([^)]*\)|[^,)]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(calls, ["commentApiUrl(p.repo, p.number)", "pullsApiUrl(repo)", "checkRunsApiUrl(repo, t.sha)"]);
  // The voice module loads one pinned library, and fetches nothing itself.
  assert.match(voice, /@huggingface\/transformers@\d+\.\d+\.\d+"/);
  assert.doesNotMatch(voice, /fetch\(/);
});

test("the token is held in memory, never stored", () => {
  assert.doesNotMatch(script, /localStorage\.setItem\([^)]*token/i);
  assert.doesNotMatch(script, /sessionStorage/);
  assert.match(page, /type="password"/);
});

test("a comment is only posted from sendPending, which only confirm reaches", () => {
  assert.equal(script.match(/method: "POST"/g).length, 1);
  const post = script.indexOf('method: "POST"');
  assert.ok(post > script.indexOf("async function sendPending()"));
  assert.ok(post < script.indexOf("// ---------- GitHub ----------"));
});

test("never writes untrusted text as HTML", () => {
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("has a phone viewport and a canonical link", () => {
  assert.match(page, /name="viewport"/);
  assert.match(page, /rel="canonical" href="\.\/vr\.html"/);
});
