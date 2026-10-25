import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pluginSource, readmeTxt, buildPlugin, embedUrl, NAME } from './wordpress.mjs';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-'));
  await fs.mkdir(path.join(root, 'platform/pages'), { recursive: true });
  await fs.writeFile(path.join(root, 'platform/pages/launched.json'), JSON.stringify({ launched: { a: '2026-01-01', b: '2026-01-02' } }));
  for (const [slug, t] of [['a', 'Alpha "Quote" Tool'], ['b', 'Beta']]) {
    await fs.mkdir(path.join(root, 'ventures', slug), { recursive: true });
    await fs.writeFile(path.join(root, 'ventures', slug, 'index.html'), `<title>${t.replace(/"/g, '&quot;')}</title><meta name="description" content="Desc.">`);
  }
  return root;
}

test('embed URL carries the embed flag and the wordpress ref tag', () => {
  const u = new URL(embedUrl('https://x.test/a/'));
  assert.equal(u.searchParams.get('pfEmbed'), '1');
  assert.equal(u.searchParams.get('ref'), 'wordpress');
});

test('plugin has no network code, escapes output and whitelists slugs', async () => {
  const { files } = await buildPlugin({ root: await fixture() });
  const php = files[`${NAME}/${NAME}.php`];
  assert.doesNotMatch(php, /wp_remote|curl_|file_get_contents|wp_enqueue|add_action|update_option/);
  assert.match(php, /esc_url\(/);
  assert.match(php, /esc_attr\(/);
  assert.match(php, /sanitize_key\(/);
  assert.match(php, /sandbox="/);
});

test('package contains the plugin, readme.txt and licence; readme names the tool count', async () => {
  const r = await buildPlugin({ root: await fixture() });
  assert.deepEqual(Object.keys(r.files).sort(), [`${NAME}/${NAME}.php`, `${NAME}/LICENSE`, `${NAME}/readme.txt`].sort());
  assert.equal(r.count, 2);
  assert.match(readmeTxt(2), /^=== Free Tools Embed ===/);
  assert.match(readmeTxt(2), /Stable tag: 0\.1\.0/);
});

test('generated PHP lints and the shortcode renders only known slugs', async (t) => {
  const php = spawnSync('php', ['-v']);
  if (php.status !== 0) return t.skip('php not installed');
  const root = await fixture();
  const { files } = await buildPlugin({ root });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-php-'));
  const file = path.join(dir, 'plugin.php');
  await fs.writeFile(file, files[`${NAME}/${NAME}.php`]);
  const lint = spawnSync('php', ['-l', file], { encoding: 'utf8' });
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  const harness = path.join(dir, 'run.php');
  await fs.writeFile(harness, `<?php
define('ABSPATH', '/');
$GLOBALS['sc'] = array();
function add_shortcode($n, $f) { $GLOBALS['sc'][$n] = $f; }
function shortcode_atts($d, $a) { return array_merge($d, is_array($a) ? $a : array()); }
function sanitize_key($s) { return strtolower(preg_replace('/[^a-z0-9_\\\\-]/i', '', $s)); }
function absint($n) { return abs((int) $n); }
function esc_url($s) { return htmlspecialchars($s); }
function esc_attr($s) { return htmlspecialchars($s, ENT_QUOTES); }
function esc_html($s) { return htmlspecialchars($s); }
function esc_html__($s) { return htmlspecialchars($s); }
function current_user_can($c) { return false; }
require ${JSON.stringify(file)};
echo $GLOBALS['sc']['free_tool'](array('slug' => 'a', 'height' => '99999')), "\\n";
echo $GLOBALS['sc']['free_tool'](array('slug' => 'a', 'height' => '5')), "\\n";
echo '[unknown:', $GLOBALS['sc']['free_tool'](array('slug' => 'evil"><script>')), "]\\n";
echo $GLOBALS['sc']['free_tools_list'](array());
`);
  const run = spawnSync('php', [harness], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /<iframe src="https:\/\/[^"]+\/a\/\?[^"]*pfEmbed=1/);
  assert.match(run.stdout, /height="2000"/);
  assert.match(run.stdout, /height="300"/);
  assert.doesNotMatch(run.stdout, /height="30[1-9]"/);
  assert.match(run.stdout, /Alpha &quot;Quote&quot; Tool/);
  assert.match(run.stdout, /\[unknown:\]/);
  assert.doesNotMatch(run.stdout, /<script>/);
  assert.match(run.stdout, /<li><a href="[^"]+\/b\/">Beta<\/a><\/li>/);
});

const script = fileURLToPath(new URL('./wordpress.mjs', import.meta.url));

test('CLI without --build only reports what it would package', () => {
  const r = spawnSync('node', [script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^would package \d+ tools as free-tools-embed-.*\.zip; --build <dir> writes it/);
});

test('CLI --build needs a directory and exits 2 with usage without one', () => {
  const r = spawnSync('node', [script, '--build'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: wordpress\.mjs --build <outDir>/);
});

test('CLI --build writes a zip named after the plugin into the given directory', async () => {
  const dir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'wp-out-')), 'nested', 'out');
  const r = spawnSync('node', [script, '--build', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const names = await fs.readdir(dir);
  assert.equal(names.length, 1);
  assert.match(names[0], /^free-tools-embed-.*\.zip$/);
  assert.match(r.stdout, new RegExp(`^wrote ${path.join(dir, names[0]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(\\d+ tools\\)`));
  const head = await fs.readFile(path.join(dir, names[0]));
  assert.equal(head.subarray(0, 2).toString(), 'PK');
});
