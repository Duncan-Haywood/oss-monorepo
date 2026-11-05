import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildAll, loadMedia, loadShorts } from './generate.mjs';
import { checkShort, parseShort, renderCard, wrap } from './shorts.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE = `---
number: 9
slug: sample
title: A sample
kind: apologetics
published: 2026-11-03
hook: A hook.
summary: A summary.
sources:
- John 1:1
- Catechism of the Catholic Church 1374, 9999
---

## Script

${'word '.repeat(130)}

## On screen

- One
- Two

## Fair to the other side

${'A fair and careful statement of what other Christians believe. '.repeat(2)}

## Caption

A caption.
`;

test('parses front matter, sections and lists', () => {
  const s = parseShort(SAMPLE);
  assert.equal(s.number, 9);
  assert.deepEqual(s.sources, ['John 1:1', 'Catechism of the Catholic Church 1374, 9999']);
  assert.deepEqual(s.beats, ['One', 'Two']);
  assert.equal(s.script.length, 1);
});

test('flags a Catechism paragraph that does not exist', () => {
  assert.deepEqual(checkShort(parseShort(SAMPLE)), ['no Catechism paragraph "9999"']);
});

test('flags a script too long for a short and a story not labelled fiction', () => {
  const long = SAMPLE.replace('word '.repeat(130), 'word '.repeat(200)).replace('kind: apologetics', 'kind: story');
  const problems = checkShort(parseShort(long));
  assert.ok(problems.some((p) => p.startsWith('script is 200 words')));
  assert.ok(problems.includes('a story must say it is fiction'));
});

test('a missing section is an error, not a blank page', () => {
  assert.throws(() => parseShort(SAMPLE.replace('## Caption', '## Captions')), /missing "## Caption"/);
});

test('every published short passes PRODUCTION.md and the build is fresh', () => {
  const shorts = loadShorts();
  assert.ok(shorts.length >= 8);
  for (const s of shorts) assert.deepEqual(checkShort(s), [], s.slug);
  assert.equal(new Set(shorts.map((s) => s.number)).size, shorts.length, 'numbers are unique');
  for (const [rel, contents] of Object.entries(buildAll())) {
    assert.equal(readFileSync(path.join(ROOT, rel), 'utf8'), contents, `${rel} is stale: run node generate.mjs`);
  }
});

test('every page carries the AI disclosure, the disclaimer and usage counting', () => {
  for (const [rel, contents] of Object.entries(buildAll())) {
    if (!rel.endsWith('.html')) continue;
    assert.match(contents, /Written by an AI\./, rel);
    assert.match(contents, /No warranty\./, rel);
    assert.match(contents, /countUsage\(/, rel);
  }
});

test('each video in the manifest exists and is a short', () => {
  for (const [slug, m] of Object.entries(loadMedia())) {
    const bytes = readFileSync(path.join(ROOT, 'video', `${slug}.mp4`)).length;
    assert.equal(bytes, m.bytes, slug);
    assert.ok(m.seconds <= 90, `${slug} runs ${m.seconds} s`);
  }
});

test('every video has a captions track whose cues stay inside the video', () => {
  const stamp = (t) => { const [h, m, sec] = t.split(':'); return +h * 3600 + +m * 60 + +sec; };
  for (const [slug, m] of Object.entries(loadMedia())) {
    assert.ok(m.captions, `${slug} has no captions/${slug}.vtt (python3 make_captions.py ${slug})`);
    const vtt = readFileSync(path.join(ROOT, 'captions', `${slug}.vtt`), 'utf8');
    assert.match(vtt, /^WEBVTT\n/);
    const times = [...vtt.matchAll(/(\S+) --> (\S+)/g)].map((x) => [stamp(x[1]), stamp(x[2])]);
    assert.ok(times.length >= 8, slug);
    let prev = 0;
    for (const [a, b] of times) { assert.ok(a >= prev - 1e-6 && b > a, `${slug} cue order`); prev = b; }
    assert.ok(prev <= m.seconds, `${slug} captions run past the video`);
    assert.match(readFileSync(path.join(ROOT, `${slug}.html`), 'utf8'), /<track kind="captions"/, slug);
  }
});

test('cards escape text and wrap long titles', () => {
  assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four']);
  const svg = renderCard({ title: 'A & B', kind: 'story', hook: '<x>' });
  assert.match(svg, /A &amp; B/);
  assert.doesNotMatch(svg, /<x>/);
});
