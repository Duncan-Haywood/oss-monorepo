import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  parseReadme,
  findPluginHeaderFile,
  parsePluginHeader,
  detectUnescapedOutput,
  detectMissingNonceChecks,
  buildReport,
} from './scan.mjs';

const html = fs.readFileSync(new URL('./vs-manually-checking-against-the-guidelines.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('names no vendor or competing product as the point of comparison', () => {
  // Compares against the generic habit of reading the guidelines and
  // checking your own files by eye -- not a company or product this could
  // be mistaken for. The single cross-link to this venture's own
  // vs-plugin-check.html (which does name wordpress.org's Plugin Check and
  // carries the trademark disclaimer) is expected and does not make this
  // page a named-product comparison itself. Registered as disclaimer-exempt
  // in clauses.mjs on that basis.
  assert.doesNotMatch(html, /wp-cli|codeception|phpcs|phpunit|accessibe|userway/i);
  assert.equal((html.match(/plugin check/gi) ?? []).length, 1, 'expected exactly one cross-link mention of Plugin Check, not a comparison against it');
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-manually-checking-against-the-guidelines\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the worked example figures match scan.mjs against the bundled example files', () => {
  // Same worked example index.html's "load example" button uses, pinned
  // here directly against scan.mjs so the page's claimed numbers cannot
  // drift from what the tool itself would report.
  const readmeText = `=== Example Plugin ===
Contributors: exampledev
Tags: example, demo
Requires at least: 6.0
Tested up to: 6.6
Stable tag: 1.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

== Description ==

An example plugin used to demonstrate this checker.
`;
  const pluginFileText = `<?php
/**
 * Plugin Name: Example Plugin
 * Version: 1.3.0
 * License: GPL-2.0-or-later
 */

if ( isset( $_GET['name'] ) ) {
    echo 'Hello, ' . $_GET['name'];
}

function example_save_settings() {
    if ( isset( $_POST['example_option'] ) ) {
        update_option( 'example_option', $_POST['example_option'] );
    }
}
`;

  const readme = parseReadme(readmeText);
  assert.equal(readme.found, true);
  assert.deepEqual(readme.missingRequired, [], 'the bundled example readme must carry every required field');

  const files = [{ path: 'example-plugin.php', content: pluginFileText }];
  const headerFile = findPluginHeaderFile(files);
  assert.ok(headerFile, 'the bundled example plugin file must carry a Plugin Name header');
  const pluginHeader = parsePluginHeader(headerFile);
  assert.deepEqual(pluginHeader.missingRequired, []);

  const unescapedOutput = detectUnescapedOutput(files);
  const missingNonceChecks = detectMissingNonceChecks(files);
  const report = buildReport({ readme, pluginHeader, unescapedOutput, missingNonceChecks });

  assert.equal(report.stableTagStatus, 'mismatch');
  assert.deepEqual(report.stableTagMismatch, { stableTag: '1.2.0', pluginVersion: '1.3.0' });
  assert.equal(report.unescapedOutput.length, 1);
  assert.equal(report.missingNonceChecks.length, 1);
  assert.equal(report.ok, false, 'an example with a mismatch, unescaped output, and a missing nonce check must not report ok');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-manually-checking-against-the-guidelines\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-manually-checking-against-the-guidelines\.html/);
});

test('the comparison page links back to the calculator and to the other comparison/guide pages', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="vs-plugin-check\.html"/);
  assert.match(html, /href="stable-tag-mismatch\.html"/);
});
