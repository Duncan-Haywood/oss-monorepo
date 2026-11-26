// Captures the home page's showcase: a still of each tool below with its own
// worked example loaded, and one short screen recording of a few of them being
// used. Everything shown is the real tool on a locally built site, not a mock.
//
//   node build.mjs --out=dist            # in platform/pages
//   (cd dist && python3 -m http.server 8765) &
//   node showcase/capture.mjs [http://localhost:8765]
//   node showcase/capture.mjs --stills-only [--only=slug,slug] [base url]
//
// `--stills-only` retakes stills and keeps the recording; `--only` limits it
// to the named tools and keeps every other entry in the manifest as it was.
//
// Needs Playwright's Chromium, ImageMagick (`convert`, for WebP) and ffmpeg.
// In a cloud session a bare `playwright` import fails: prefix the command with
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js.
// Rerun it when a tool's look changes; `manifest.json` is what the hub reads,
// and the hub drops any entry whose tool is no longer published.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARGS = process.argv.slice(2);
const STILLS_ONLY = ARGS.includes('--stills-only');
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice('--only='.length).split(',').filter(Boolean);
const BASE = (ARGS.find((a) => !a.startsWith('--')) || 'http://localhost:8765').replace(/\/$/, '');
const pwModule = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { chromium } = pwModule.chromium ? pwModule : pwModule.default;

// slug, the button that loads its example, the text to scroll to (default:
// the biggest table or drawing on the page), and the caption under the still.
// `hero` (a CSS selector) also takes a close crop for the hub's hero, starting
// at that element: see HERO_VIEWPORT.
export const SHOTS = [
  { slug: 'wall-framing-takeoff', focus: 'Wall drawing and layout marks', hero: '#drawing', caption: 'Draws every stud, header and cripple, then prices the lumber order' },
  // Bet #1's front door (portfolio/monetization/bets.md): the pay-app suite's free generator.
  { slug: 'pay-application-generator', click: ['#load-ok', '#calc'], focus: 'Current payment due', hero: '#due', caption: 'Rolls a schedule of values into a G702-style pay application, retainage and all' },
  // Bet #3's front door: the e-invoice checker, a broken invoice loaded and checked.
  { slug: 'einvoice-preflight', click: ['#sample', '#check'], focus: 'Preflight result', hero: '#results', caption: 'Checks an e-invoice against the EN 16931 rules and names the fix for each failure' },
  { slug: 'cnc-machining-quote-calculator', click: '#example', focus: 'This job', hero: '#results .headline', caption: 'Costs a machined part from your own rates, then prices it at every lot size' },
  { slug: 'dxf-nesting', click: ['#load-example', '#nest'], focus: '3. Nested sheets', hero: '#sheets', caption: 'Nests DXF parts on sheets, holes filled, with cut length and pierces' },
  { slug: 'container-load-planner', click: '#load-example', hero: 'h3:has(+ #view-top)', caption: 'Packs cartons and pallets into containers, drawn to scale' },
  { slug: 'band-tour-profit-planner', click: '#load-example', focus: 'Your tour', hero: '#big', caption: 'Shows which tour dates lose money before you book the van' },
  { slug: 'league-schedule-generator', click: '#load-example', focus: 'Your schedule', hero: '#rounds-table', caption: 'Builds a fair round-robin league schedule in a minute' },
  { slug: 'event-seating-chart-optimizer', click: '#load-example', focus: 'Seating plan', hero: '#tables', caption: 'Seats every guest with the most wishes met' },
  { slug: 'invoice-maker', click: '#load-example', focus: 'Receivables', hero: '#dash', caption: 'Makes invoices and ages what is still owed' },
  { slug: 'ebay-fee-calculator', focus: 'Promoted Listings Standard vs skip', hero: '#promotedStandardTable', caption: 'Says what an eBay sale really leaves after fees' },
  { slug: 'incident-postmortem-timeline', click: '#load-example', focus: 'Response metrics', hero: '#report-card', caption: 'Measures detect-to-resolve times and drafts a blameless postmortem' },
  { slug: 'greenhouse-bench-planner', click: '#load-ok', focus: 'Result', hero: 'h3:has(+ .scroll #weeks)', caption: 'Plans sowing weeks against greenhouse bench space' },
  // Built from the custom-development queue (portfolio/requests/requests.json):
  // /custom-development/ shows these beside their request ids (REQUEST_SHOWCASE in build.mjs).
  { slug: 'ai-bookkeeper', click: ['#example', '#accept-all', '#file-checked'], hero: '#h-reports', caption: 'Files a bank export into double-entry books, then reports profit and loss by month' },
  { slug: 'sales-agent', click: ['#load-example', '#go'], hero: '#out', caption: 'Reads sales replies, sorts them and drafts the answers for you to approve' },
  { slug: 'clothing-design-studio', hero: '#stage', caption: 'Designs a garment from plain words, then costs it and writes the tech pack' },
];

// The tools the recording walks through, in order.
const REEL = ['container-load-planner', 'league-schedule-generator', 'band-tour-profit-planner', 'event-seating-chart-optimizer'];

const VIEWPORT = { width: 1280, height: 800 };

// The hero's crops. The hub shows its three hero stills about 300 px wide, so a
// full 1,280 px page drops text to about 3 px there (polish-2026-11-16-hero-art.md,
// "Still weakest" 1). Here the tool is laid out 720 px wide, and a 16:10 box
// (720 x 450) is cut from its `hero` element down, at 2x, then saved at 600 x 375:
// the same aspect as the stills, text about 1.8 times larger, sharp on a 2x screen.
// The top ~240 px of the box are what shows of the two cards the third overlaps.
const HERO_VIEWPORT = { width: 720, height: 900 };
const HERO_BOX = { width: 720, height: 450 };
const HERO_SIZE = '600x375';
// And a 1,200 px twin for the srcset: a 290 px gallery card on a 3x phone
// wants 870 px (polish-2026-11-17-hero-srcset.md).
const HERO_WIDE_SIZE = '1200x750';

/** A close crop of `shot.hero` and what follows it, for the hub's hero (HERO_VIEWPORT). */
async function heroCrop(page, shot, png) {
  await show(page, shot);
  const pad = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el || el.getBoundingClientRect().height === 0) return null;
    // Up to 12 px of air above it, but not into the element before (the wall
    // picker's bottom border showed above Wall Framing Takeoff's drawing). The
    // element before is the nearest visible earlier sibling of it or of a parent:
    // a table that opens its .scroll wrapper has none of its own, and the League
    // Schedule Generator's note above the wrapper bled into its crop.
    const r = el.getBoundingClientRect();
    let prev = null;
    for (let node = el; node && node !== document.body && !prev; node = node.parentElement) {
      for (let sib = node.previousElementSibling; sib && !prev; sib = sib.previousElementSibling) {
        const box = sib.getBoundingClientRect();
        if (box.height > 0 && box.bottom <= r.top + 1) prev = box;
      }
    }
    const pad = prev ? Math.max(0, Math.min(12, r.top - prev.bottom - 2)) : 12;
    window.scrollTo({ top: r.top + window.scrollY - pad, behavior: 'instant' });
    return pad;
  }, shot.hero);
  if (pad == null) throw new Error(`${shot.slug}: hero selector ${shot.hero} matched nothing visible`);
  await page.waitForTimeout(300);
  // Measured again after the scroll and cut from the viewport, not a full-page
  // shot: a full-page capture lays the page out again at its whole height, and
  // on the League Schedule Generator that moved the table about 20 px, so the
  // note above it showed in the crop.
  const y = await page.evaluate(([selector, p]) => document.querySelector(selector).getBoundingClientRect().top - p, [shot.hero, pad]);
  const clipY = Math.max(0, Math.min(HERO_VIEWPORT.height - HERO_BOX.height, y));
  await page.screenshot({ path: png, clip: { x: 0, y: clipY, ...HERO_BOX } });
}

async function show(page, shot) {
  await page.goto(`${BASE}/${shot.slug}/`, { waitUntil: 'load' });
  // `click` is one selector or a list clicked in order (load an example, then run it).
  for (const selector of [shot.click ?? []].flat()) {
    await page.click(selector);
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
      // Instant: a smooth scroll down a long page (wall-framing-takeoff, ~9,600 px)
      // had not arrived when the screenshot was taken.
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, shot.focus || null);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.scrollBy(0, -24);
    // Floating controls (the site assistant's "Speak or type" button) sat in
    // the same corner of every still; the still is about the tool's answer.
    for (const el of document.querySelectorAll('body *')) {
      if (getComputedStyle(el).position === 'fixed') el.style.visibility = 'hidden';
    }
  });
  await page.waitForTimeout(200);
}

const browser = await chromium.launch();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'showcase-'));
try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const heroPage = await browser.newPage({ viewport: HERO_VIEWPORT, deviceScaleFactor: 2 });
  const previous = existsSync(path.join(HERE, 'manifest.json'))
    ? JSON.parse(readFileSync(path.join(HERE, 'manifest.json'), 'utf8'))
    : { shots: [], reel: null };
  const manifest = { generated: new Date().toISOString().slice(0, 10), shots: [], reel: STILLS_ONLY ? previous.reel : null };
  const unknown = ONLY.filter((slug) => !SHOTS.some((s) => s.slug === slug));
  if (unknown.length) throw new Error(`not in SHOTS: ${unknown.join(', ')}`);
  for (const shot of SHOTS) {
    if (ONLY.length && !ONLY.includes(shot.slug)) {
      const kept = previous.shots.find((s) => s.slug === shot.slug);
      if (kept) manifest.shots.push(kept);
      continue;
    }
    await show(page, shot);
    const png = path.join(tmp, `${shot.slug}.png`);
    await page.screenshot({ path: png });
    const file = `${shot.slug}.webp`;
    execFileSync('convert', [png, '-resize', '960x600', '-quality', '72', path.join(HERE, file)]);
    const entry = { slug: shot.slug, file, caption: shot.caption };
    if (shot.hero) {
      const heroPng = path.join(tmp, `${shot.slug}-hero.png`);
      await heroCrop(heroPage, shot, heroPng);
      entry.hero = `${shot.slug}-hero.webp`;
      execFileSync('convert', [heroPng, '-resize', HERO_SIZE, '-quality', '78', path.join(HERE, entry.hero)]);
      entry.heroWide = `${shot.slug}-hero-1200.webp`;
      execFileSync('convert', [heroPng, '-resize', HERO_WIDE_SIZE, '-quality', '72', path.join(HERE, entry.heroWide)]);
      console.log(`hero crop: ${entry.hero}`);
    }
    manifest.shots.push(entry);
    console.log(`still: ${file}`);
  }

  if (STILLS_ONLY) {
    writeFileSync(path.join(HERE, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log('kept the existing recording (--stills-only)');
  } else {
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
  }
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
