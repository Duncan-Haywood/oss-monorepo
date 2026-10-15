import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnippet, stateSize, humanBytes } from "./snippet.mjs";

test("snippet needs an https host and strips trailing slashes", () => {
  assert.equal(buildSnippet("http://x.example"), null);
  assert.equal(buildSnippet("https://x.example/", {}).tag, '<script defer src="https://x.example/t.js"></script>');
  assert.match(buildSnippet("https://x.example", { honorDnt: false }).tag, /data-ignore-dnt/);
});

test("goal names are cleaned so they cannot break out of the string", () => {
  assert.equal(buildSnippet("https://x.example", { goalName: 'sign"); alert(1);//' }).goal.includes('"); alert'), false);
  assert.equal(buildSnippet("https://x.example", {}).goal, null);
});

test("state size grows with traffic and stays small for a typical site", () => {
  const s = stateSize({ visitorsPerDay: 1000 });
  assert.ok(s.totalBytes < 200e6);
  assert.ok(stateSize({ visitorsPerDay: 100_000 }).scratchBytes > s.scratchBytes);
  assert.equal(humanBytes(2_500_000), "2.5 MB");
});
