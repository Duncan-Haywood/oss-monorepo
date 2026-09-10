// Does a page already link a Web App Manifest, and does the build wire one in
// when it does not?
//
// `injectOfflineSupport` had no direct test until 2026-09-10. It was covered
// only through build.test.mjs's whole-site assertion ("every published page
// registers the worker and points at the manifest"), which is the right guard
// for the outcome but a poor one for the decision: it reports *which page*
// ended up without a worker, never *why* the injector declined to wire it.
//
// The why mattered. The check used to be `html.includes('rel="manifest"')`
// over the entire file, which cannot tell a manifest link from a page that
// merely writes the attribute down -- and the ventures most likely to write it
// down are the PWA and crawler tools whose whole subject is manifests. These
// pin the distinction directly, so a regression names the rule it broke.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { injectOfflineSupport, linksManifest } from './offline.mjs';

const page = (head, body = '<p>hi</p>') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

test('a page with no manifest link gets the offline wiring', () => {
  const { html, injected } = injectOfflineSupport(page(''), '');
  assert.equal(injected, true);
  assert.match(html, /serviceWorker/);
  assert.match(html, /rel="manifest"/);
});

test('a page that already links a manifest is left alone', () => {
  const source = page('<link rel="manifest" href="app.webmanifest">');
  const { html, injected } = injectOfflineSupport(source, '');
  assert.equal(injected, false);
  assert.equal(html, source);
});

test('rel is a token list, so extra tokens still count as a manifest link', () => {
  assert.equal(linksManifest(page('<link rel="manifest alternate" href="a.json">')), true);
  assert.equal(linksManifest(page("<link rel='manifest' href='a.json'>")), true);
  assert.equal(linksManifest(page('<link rel=manifest href=a.json>')), true);
});

test('a rel that merely starts with "manifest" is not a manifest link', () => {
  assert.equal(linksManifest(page('<link rel="manifest-notes" href="a.html">')), false);
});

// The regression this file exists for. Each of these pages links no manifest
// and must therefore be wired for offline use, however much of the attribute
// its copy happens to spell.
test('prose about the manifest attribute does not count as linking one', () => {
  const prose = page(
    '<title>Why is my PWA not installable?</title>',
    '<p>Chrome needs a <code>&lt;link rel="manifest"&gt;</code> in the head.</p>',
  );
  assert.equal(linksManifest(prose), false);
  assert.equal(injectOfflineSupport(prose, '').injected, true);
});

test('a code sample in the head does not count as linking a manifest', () => {
  const sample = page('<script>const example = \'<link rel="manifest">\';</script>');
  assert.equal(linksManifest(sample), false);
  assert.equal(injectOfflineSupport(sample, '').injected, true);
});

test('an HTML comment about the attribute does not count as linking a manifest', () => {
  const commented = page('<!-- a <link rel="manifest"> belongs here, but is injected -->');
  assert.equal(linksManifest(commented), false);
  assert.equal(injectOfflineSupport(commented, '').injected, true);
});

test('an escaped manifest link inside JSON-LD does not count as linking one', () => {
  const jsonLd = page(
    '<script type="application/ld+json">{"@type":"FAQPage","mainEntity":' +
      '[{"name":"Where does the tag go?","text":"Put the <link rel=\\"manifest\\"> in the head."}]}</script>',
  );
  assert.equal(linksManifest(jsonLd), false);
  assert.equal(injectOfflineSupport(jsonLd, '').injected, true);
});

test('a manifest link in the body does not satisfy the head requirement', () => {
  // Not a supported place to put it, and the wiring belongs in the head either
  // way -- so the injector must not treat a stray body link as done.
  const body = page('', '<link rel="manifest" href="app.webmanifest">');
  assert.equal(linksManifest(body), false);
  assert.equal(injectOfflineSupport(body, '').injected, true);
});

test('injection is idempotent: a second pass changes nothing', () => {
  const once = injectOfflineSupport(page(''), '').html;
  const twice = injectOfflineSupport(once, '');
  assert.equal(twice.injected, false);
  assert.equal(twice.html, once);
});

test('a page with no head is left alone rather than corrupted', () => {
  const headless = '<p>fragment</p>';
  const { html, injected } = injectOfflineSupport(headless, '');
  assert.equal(injected, false);
  assert.equal(html, headless);
});

test('rootRel is carried into every injected URL, so a subpath page resolves', () => {
  const { html } = injectOfflineSupport(page(''), '../');
  assert.match(html, /href="\.\.\/manifest\.webmanifest"/);
  assert.match(html, /register\('\.\.\/sw\.js'\)/);
});
