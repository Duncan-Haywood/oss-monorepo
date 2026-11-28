import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { applyDir, linkedStylesheets, pageIsNative, themePage } from './apply.mjs';
import {
  BOOT_MARKER,
  THEME_BOOT_JS,
  THEME_HEAD_CSS,
  THEME_UI_JS,
  parseBlocks,
  readSchemeQuery,
  rewriteSchemeCss,
  scopeSelector,
  splitSelectors,
} from './theme.mjs';

test('parseBlocks round-trips a stylesheet exactly', () => {
  const css = `/* a { */ @import "x.css";\n:root{--a:1}\n@media (max-width:600px){a[href="}"]{b:c}}\n@font-face{font-family:x}`;
  const back = parseBlocks(css)
    .map((n) => (n.kind === 'raw' ? n.text : `${n.prelude}{${n.body}}`))
    .join('');
  assert.equal(back, css);
});

test('splitSelectors ignores commas inside parentheses and attributes', () => {
  assert.deepEqual(splitSelectors('a, :is(b,c), [x="1,2"]'), ['a', ' :is(b,c)', ' [x="1,2"]']);
});

test('scopeSelector keeps the selector and adds the condition in :where()', () => {
  const c = '[data-theme="dark"]';
  assert.equal(scopeSelector(':root', c), ':root:where([data-theme="dark"])');
  assert.equal(scopeSelector('html body', c), 'html:where([data-theme="dark"]) body');
  assert.equal(scopeSelector(' .card > a ', c), ' :where(:root[data-theme="dark"]) .card > a ');
  assert.equal(scopeSelector('htmlish', c), ':where(:root[data-theme="dark"]) htmlish');
});

test('readSchemeQuery reads plain conjunctions and leaves anything else', () => {
  assert.deepEqual(readSchemeQuery('@media (prefers-color-scheme: dark)'), { scheme: 'dark', rest: '' });
  assert.deepEqual(readSchemeQuery('@media screen and (prefers-color-scheme:light)'), { scheme: 'light', rest: 'screen' });
  assert.deepEqual(readSchemeQuery('@media (prefers-color-scheme:dark) and (max-width: 600px)'), {
    scheme: 'dark',
    rest: '(max-width: 600px)',
  });
  assert.equal(readSchemeQuery('@media (prefers-color-scheme:dark), print'), null);
  assert.equal(readSchemeQuery('@media not all and (prefers-color-scheme:dark)'), null);
  assert.equal(readSchemeQuery('@media (max-width:600px)'), null);
});

test('rewriteSchemeCss makes a dark block obey an explicit choice', () => {
  const out = rewriteSchemeCss(':root{--bg:#fff}@media (prefers-color-scheme: dark){:root{--bg:#000}.x,a:hover{color:red}}p{m:0}');
  assert.equal(
    out,
    ':root{--bg:#fff}' +
      '@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])){--bg:#000}:where(:root:not([data-theme="light"])) .x,:where(:root:not([data-theme="light"])) a:hover{color:red}}' +
      ':root:where([data-theme="dark"]){--bg:#000}:where(:root[data-theme="dark"]) .x,:where(:root[data-theme="dark"]) a:hover{color:red}' +
      'p{m:0}',
  );
});

test('rewriteSchemeCss keeps other media conditions and handles light blocks', () => {
  const out = rewriteSchemeCss('@media (prefers-color-scheme:light) and (min-width:40em){body{c:1}}');
  assert.match(out, /^@media \(prefers-color-scheme:light\) and \(min-width:40em\)\{:where\(:root:not\(\[data-theme="dark"\]\)\) body\{c:1\}\}/);
  assert.match(out, /@media \(min-width:40em\)\{:where\(:root\[data-theme="light"\]\) body\{c:1\}\}$/);
});

test('rewriteSchemeCss recurses into @supports and leaves @keyframes alone', () => {
  const out = rewriteSchemeCss('@supports (display:grid){@media (prefers-color-scheme:dark){@keyframes k{from{o:0}}a{c:1}}}');
  assert.ok(out.includes('@keyframes k{from{o:0}}'));
  assert.ok(out.includes(':where(:root[data-theme="dark"]) a{c:1}'));
  assert.ok(out.startsWith('@supports (display:grid){'));
});

test('rewriteSchemeCss is idempotent and leaves pages that already scope themselves', () => {
  const css = '@media (prefers-color-scheme:dark){a{c:1}}';
  const once = rewriteSchemeCss(css);
  assert.equal(rewriteSchemeCss(once), once);
  const own = '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--a:1}}:root[data-theme="dark"]{--a:1}';
  assert.equal(rewriteSchemeCss(own), own);
  assert.equal(rewriteSchemeCss('a{c:1}'), 'a{c:1}');
});

test('native detection ignores the site chrome stylesheet and the boot block', () => {
  const root = '/site';
  const html = '<link rel="stylesheet" href="../pf-site.css"><link rel="stylesheet" href="style.css"><link rel=stylesheet href="https://x/y.css">';
  assert.deepEqual(linkedStylesheets(html, '/site/tool/index.html', root), ['/site/tool/style.css']);
  assert.equal(pageIsNative(`<style ${BOOT_MARKER}>${THEME_HEAD_CSS}</style>`, []), false);
  assert.equal(pageIsNative('<style>@media (prefers-color-scheme:dark){a{c:1}}</style>', []), true);
  assert.equal(pageIsNative('<style>a{c:1}</style>', ['@media (prefers-color-scheme: dark){b{c:2}}']), true);
});

test('themePage puts the boot after <meta charset>, marks <html> and loads the control', () => {
  const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>x</title></head><body><p>hi</p></body></html>';
  const out = themePage(page, { native: false, scriptSrc: '../pf-theme.js' });
  assert.match(out, /^<!doctype html><html data-theme-fallback lang="en"><head><meta charset="utf-8"><style data-pfs-theme-boot>/);
  assert.match(out, /<script defer src="\.\.\/pf-theme\.js"><\/script><\/body>/);
  assert.equal(themePage(out, { native: false, scriptSrc: 'x' }), out);
  assert.equal(themePage('<p>fragment</p>', { native: true, scriptSrc: 'x' }), '<p>fragment</p>');
});

/** A tiny DOM-less sandbox for the boot script. */
function bootSandbox({ stored = null, osDark = false } = {}) {
  const attrs = new Map();
  const store = new Map(stored ? [['pfs-theme', stored]] : []);
  const osListeners = [];
  const os = { matches: osDark, addEventListener: (_t, f) => osListeners.push(f) };
  const win = {
    matchMedia: (q) => (/prefers-color-scheme/.test(q) ? os : { matches: false, media: q }),
    addEventListener() {},
  };
  const ctx = {
    window: win,
    document: {
      documentElement: {
        style: {},
        setAttribute: (k, v) => attrs.set(k, v),
        removeAttribute: (k) => attrs.delete(k),
        hasAttribute: (k) => attrs.has(k),
      },
    },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
  };
  vm.createContext(ctx);
  vm.runInContext(THEME_BOOT_JS, ctx);
  return { ctx, attrs, store, os, osListeners, win };
}

test('boot script applies the stored choice before paint', () => {
  const { attrs, ctx } = bootSandbox({ stored: 'dark' });
  assert.equal(attrs.get('data-theme'), 'dark');
  assert.equal(ctx.document.documentElement.style.colorScheme, 'dark');
  const auto = bootSandbox({ stored: 'bogus' });
  assert.equal(auto.attrs.has('data-theme'), false);
});

test('boot script answers colour-scheme queries with the choice and notifies listeners', () => {
  const { win, store, attrs } = bootSandbox({ osDark: true });
  const mq = win.matchMedia('(prefers-color-scheme: dark)');
  assert.equal(mq.matches, true);
  const seen = [];
  mq.addEventListener('change', (e) => seen.push(e.matches));
  win.pfsTheme.set('light');
  assert.equal(mq.matches, false);
  assert.deepEqual(seen, [false]);
  assert.equal(store.get('pfs-theme'), 'light');
  assert.equal(attrs.get('data-theme'), 'light');
  win.pfsTheme.set('auto');
  assert.equal(store.has('pfs-theme'), false);
  assert.deepEqual(seen, [false, true]);
  // Other queries go to the browser untouched.
  assert.equal(win.matchMedia('(max-width: 600px)').media, '(max-width: 600px)');
});

test('the control script parses', () => {
  assert.doesNotThrow(() => new vm.Script(THEME_UI_JS));
});

test('applyDir themes every page once and writes the control', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-'));
  await fs.mkdir(path.join(dir, 'tool'));
  await fs.writeFile(path.join(dir, 'pf-site.css'), '@media (prefers-color-scheme:dark){:root{--x:1}}');
  await fs.writeFile(path.join(dir, 'tool', 's.css'), 'a{c:1}');
  await fs.writeFile(path.join(dir, 'index.html'), '<html><head><style>@media (prefers-color-scheme:dark){a{c:1}}</style></head><body></body></html>');
  await fs.writeFile(path.join(dir, 'tool', 'index.html'), '<html><head><link rel="stylesheet" href="../pf-site.css"><link rel="stylesheet" href="s.css"></head><body></body></html>');
  const r = await applyDir(dir);
  assert.deepEqual(r, { pages: 2, native: 1, fallback: 1, cssChanged: 1 });
  const tool = await fs.readFile(path.join(dir, 'tool', 'index.html'), 'utf8');
  assert.match(tool, /<html data-theme-fallback>/);
  assert.match(tool, /src="\.\.\/pf-theme\.js"/);
  const home = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
  assert.match(home, /<html data-theme-native>/);
  assert.match(home, /:where\(:root\[data-theme="dark"\]\) a\{c:1\}/);
  assert.match(await fs.readFile(path.join(dir, 'pf-site.css'), 'utf8'), /data-theme="dark"/);
  assert.deepEqual(await applyDir(dir), { pages: 0, native: 0, fallback: 0, cssChanged: 0 });
  await fs.rm(dir, { recursive: true });
});
