#!/usr/bin/env node
// Render a short's video frames to PNG with the pre-installed Playwright
// Chromium: the hook card, one card per on-screen beat, and an end card.
//
//   node make_frames.mjs <slug> <out-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadShorts } from './generate.mjs';
import { renderCard } from './shorts.mjs';

const [slug, out] = process.argv.slice(2);
const s = loadShorts().find((x) => x.slug === slug);
if (!s || !out) throw new Error('usage: node make_frames.mjs <slug> <out-dir>');
mkdirSync(out, { recursive: true });
const frames = [renderCard(s), ...s.beats.map((b) => renderCard(s, { text: b })),
  renderCard({ ...s, title: 'Check the sources' }, { text: 'Full script, sources and the other side on marisstella.app' })];
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
for (const [i, svg] of frames.entries()) {
  const html = `<html><body style="margin:0">${svg.replace('width="1080" height="1920"', 'width="720" height="1280"')}</body></html>`;
  await page.setContent(html);
  await page.screenshot({ path: path.join(out, `frame-${String(i).padStart(2, '0')}.png`) });
}
await browser.close();
writeFileSync(path.join(out, 'frames.json'), JSON.stringify({ count: frames.length }));
console.log(`${frames.length} frames in ${out}`);
