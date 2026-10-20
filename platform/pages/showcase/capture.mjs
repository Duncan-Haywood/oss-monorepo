// Captures the home page's showcase: a still of each tool below with its own
// worked example loaded, and one short screen recording of a few of them being
// used. Everything shown is the real tool on a locally built site, not a mock.
//
//   node build.mjs --out=dist            # in platform/pages
//   (cd dist && python3 -m http.server 8765) &
//   node showcase/capture.mjs [http://localhost:8765]
//
// Needs Playwright's Chromium, ImageMagick (`convert`, for WebP) and ffmpeg.
// Rerun it when a tool's look changes; `manifest.json` is what the hub reads,
// and the hub drops any entry whose tool is no longer published.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

// slug, the button that loads its example, the text to scroll to (default:
// the biggest table or drawing on the page), and the caption under the still.
export const SHOTS = [
  { slug: 'container-load-planner', click: '#load-example', caption: 'Packs cartons and pallets into containers, drawn to scale' },
  { slug: 'band-tour-profit-planner', click: '#load-example', focus: 'Your tour', caption: 'Shows which tour dates lose money before you book the van' },
  { slug: 'league-schedule-generator', click: '#load-example', focus: 'Your schedule', caption: 'Builds a fair round-robin league schedule in a minute' },
  { slug: 'event-seating-chart-optimizer', click: '#load-example', focus: 'Seating plan', caption: 'Seats every guest with the most wishes met' },
  { slug: 'invoice-maker', click: '#load-example', focus: 'Receivables', caption: 'Makes invoices and ages what is still owed' },
  { slug: 'ebay-fee-calculator', focus: 'Promoted Listings Standard vs skip', caption: 'Says what an eBay sale really leaves after fees' },
  { slug: 'incident-postmortem-timeline', click: '#load-example', focus: 'Response metrics', caption: 'Measures detect-to-resolve times and drafts a blameless postmortem' },
  { slug: 'greenhouse-bench-planner', click: '#load-ok', focus: 'Result', caption: 'Plans sowing weeks against greenhouse bench space' },
];

// The tools the recording walks through, in order.
const REEL = ['container-load-planner', 'league-schedule-generator', 'band-tour-profit-planner', 'event-seating-chart-optimizer'];

const VIEWPORT = { width: 1280, height: 800 };

async function show(page, shot) {
  await page.goto(`${BASE}/${shot.slug}/`, { waitUntil: 'load' });
  if (shot.click) {
    await page.click(shot.click);
    await page.waitForTimeout(1200);
  }
  await page.evaluate((focus) => {
    let target = null;
    if (focus) {
      target = [...document.querySelectorAll('h1,h2,h3,h4,legend,strong,p,div,summary')]
        .find((el) => el.childElementCount === 0 && el.textContent.trim() === focus && el.getBoundingClientRect().height > 0);
      target = target?.closest('section, .card, .panel') || target;
    }
    if (!target) {
      const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
      target = [...document.querySelectorAll('svg, canvas, table')]
        .filter((el) => !el.closest('header, nav, footer') && area(el) > 40000)
        .sort((a, b) => area(b) - area(a))[0];
      target = target?.closest('section') || target;
    }
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, shot.focus || null);
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollBy(0, -24));
  await page.waitForTimeout(200);
}

const browser = await chromium.launch();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'showcase-'));
try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const manifest = { generated: new Date().toISOString().slice(0, 10), shots: [], reel: null };
  for (const shot of SHOTS) {
    await show(page, shot);
    const png = path.join(tmp, `${shot.slug}.png`);
    await page.screenshot({ path: png });
    const file = `${shot.slug}.webp`;
    execFileSync('convert', [png, '-resize', '960x600', '-quality', '72', path.join(HERE, file)]);
    manifest.shots.push({ slug: shot.slug, file, caption: shot.caption });
    console.log(`still: ${file}`);
  }

  // The recording: each tool opened, its example loaded, the answer scrolled to.
  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: tmp, size: VIEWPORT } });
  const rec = await context.newPage();
  for (const slug of REEL) {
    await show(rec, SHOTS.find((s) => s.slug === slug));
    await rec.waitForTimeout(1600);
  }
  await context.close();
  const raw = path.join(tmp, readdirSync(tmp).find((f) => f.endsWith('.webm')));
  // Trim the blank first moment, drop to 960 wide and a low frame rate: it is
  // a muted loop behind a caption, and the hub should not pay megabytes for it.
  const common = ['-y', '-ss', '0.6', '-i', raw, '-an', '-vf', 'scale=960:-2,fps=24'];
  execFileSync('ffmpeg', [...common, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', path.join(HERE, 'reel.webm')], { stdio: 'ignore' });
  execFileSync('ffmpeg', [...common, '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(HERE, 'reel.mp4')], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-ss', '2.5', '-i', path.join(HERE, 'reel.mp4'), '-frames:v', '1', path.join(tmp, 'poster.png')], { stdio: 'ignore' });
  execFileSync('convert', [path.join(tmp, 'poster.png'), '-quality', '70', path.join(HERE, 'reel-poster.webp')]);
  manifest.reel = { webm: 'reel.webm', mp4: 'reel.mp4', poster: 'reel-poster.webp', tools: REEL };
  writeFileSync(path.join(HERE, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('reel: reel.webm, reel.mp4');
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
