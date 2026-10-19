import test from "node:test";
import assert from "node:assert/strict";
import { STORIES, LANGS, MODES, playlist, pauseAfter, storiesFor } from "./stories.mjs";

test("every story is well formed and has a known language", () => {
  const ids = new Set();
  for (const s of STORIES) {
    assert.ok(LANGS[s.lang], s.id);
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    assert.match(s.level, /^(A1|A2|B1|B2)$/, s.id);
    assert.ok(s.lines.length >= 6, s.id);
    for (const line of s.lines) {
      assert.equal(line.length, 2, s.id);
      assert.ok(line[0].trim() && line[1].trim(), s.id);
    }
  }
});

test("every language has at least one story", () => {
  for (const lang of Object.keys(LANGS)) assert.ok(storiesFor(lang).length >= 1, lang);
});

test("playlists interleave in the chosen order", () => {
  const s = STORIES[0];
  const both = playlist(s, "tl-en");
  assert.equal(both.length, 2 + s.lines.length * 2);
  assert.equal(both[2].text, s.lines[0][0]);
  assert.equal(both[2].lang, "es-ES");
  assert.equal(both[3].lang, "en-US");
  const flipped = playlist(s, "en-tl");
  assert.equal(flipped[2].text, s.lines[0][1]);
  const immersion = playlist(s, "tl");
  assert.equal(immersion.length, 2 + s.lines.length);
  assert.ok(immersion.slice(2).every((i) => i.lang === "es-ES"));
  assert.throws(() => playlist(s, "nope"));
  assert.ok(Object.keys(MODES).length === 3);
});

test("shadowing leaves a longer pause, and pauses scale with length but are capped", () => {
  const s = STORIES[0];
  assert.ok(playlist(s, "tl", { shadow: true })[2].pauseMs > playlist(s, "tl")[2].pauseMs);
  assert.ok(pauseAfter("a".repeat(60)) > pauseAfter("a"));
  assert.equal(pauseAfter("a".repeat(500)), pauseAfter("a".repeat(120)));
});
