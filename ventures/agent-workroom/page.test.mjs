import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
const script = page.slice(page.indexOf('<script type="module">'));

test("carries the no-warranty clause and the sponsor link", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("states tasks are never uploaded and discloses the speech service", () => {
  assert.match(page, /never uploaded/i);
  assert.match(page, /browser maker's speech service/);
});

test("lists every usage event it records", () => {
  for (const [, name] of script.matchAll(/record\("([a-z_]+)"\)/g)) {
    assert.match(page, new RegExp(`<code>${name}</code>`), `${name} is recorded but not disclosed`);
  }
});

test("never writes untrusted text as HTML", () => {
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("only talks to GitHub's API", () => {
  const hosts = [...script.matchAll(/fetch\((\w+\([^)]*\)|[^,)]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(hosts, ["pullsApiUrl(repo)"]);
});

test("has a phone viewport and a llms.txt", async () => {
  assert.match(page, /name="viewport"/);
  assert.match(await readFile(new URL("./llms.txt", import.meta.url), "utf8"), /^# Agent Workroom/);
});
