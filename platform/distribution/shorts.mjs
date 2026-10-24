/**
 * Short-form video: renders the hub's TikTok / YouTube Shorts script into a
 * finished vertical video (1080x1920, 30 fps, H.264, captions burned in).
 *
 *   node platform/distribution/shorts.mjs plan [--today D] [--days N] [--post-days N] [--slug a,b]
 *   node platform/distribution/shorts.mjs render --out <dir> [--slug a,b] [--max N] [--base URL]
 *                                        [--piper <exe> --model <voice.onnx>]
 *
 * Items are the hub's (tools launched in the last --days, posts dated in the
 * last --post-days) or the tools and posts named with --slug. Each video is:
 *
 *   hook card -> what card -> the real page, scrolled from the top to its
 *   answer with its own worked example loaded -> a hold on that answer,
 *   captioned with a figure read off the page -> closing card
 *
 * Nothing is mocked or invented: the page is the published tool (or a
 * `--base` copy of it), the figure in the caption is text the page showed,
 * and every card's words come from the page's own title and description, the
 * same source every hub variant uses. The closing card says the tool is free,
 * that results are estimates from the example's inputs and are not
 * professional advice.
 *
 * Writes, per item, `<out>/<slug>/short.mp4`, `short.srt` (the captions),
 * `poster.png` and `post.md` (TikTok caption and YouTube title and
 * description, links tagged ?ref=tiktok / ?ref=youtube), plus
 * `<out>/manifest.json`. Uploading is the owner's: both platforms lock API
 * uploads from unaudited apps to private (hub/platforms.mjs), and publishing
 * under the portfolio's name is an owner call (CLAUDE.md). Nothing here spends
 * money, posts anywhere or writes to the repository.
 *
 * Narration is optional and offline: with --piper and --model each card is
 * voiced by Piper (lighter to install in a workflow than the Kokoro engine the
 * podcast uses, platform/audio/narrate.py) and its
 * scene stretched to fit; without them the video has a silent track and the
 * captions carry everything, which is how most short video is watched anyway.
 *
 * Needs Playwright's Chromium (`PLAYWRIGHT` may name its module path) and
 * ffmpeg / ffprobe on PATH.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { byId } from './hub/platforms.mjs';
import { BASE_URL, clip, postItem, shortName, toolItem, variant } from './hub/compose.mjs';
import { readMeta } from './bluesky.mjs';
import { gatherItems } from './hub.mjs';
import { loadPosts } from '../pages/writing.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const FONTS = path.join(REPO_ROOT, 'platform', 'pages', 'fonts');

export const W = 1080;
export const H = 1920;
export const FPS = 30;
/** The phone the page is shown on, in CSS pixels; screenshots are taken at W / PHONE.width device pixels per CSS pixel. */
export const PHONE = Object.freeze({ width: 432, height: 768 });
export const SCALE = W / PHONE.width;
/** Screens of page the scroll scene travels at most. */
export const SCROLL_SCREENS = 3;

/** Seconds per scene before narration stretches it; cards also get a second per READ_RATE characters. About 25-35 s in all, under every platform's Shorts limit. */
export const SECONDS = Object.freeze({ hook: 2.5, what: 4, scroll: 7, hold: 5, close: 4.5 });

/** Buttons that load a tool's worked example, tried in order. Every tool also ships worked-example defaults. */
/** Characters a viewer reads per second, for sizing cards. */
export const READ_RATE = 17;
const readable = (base, text) => Math.max(base, Math.round((String(text).length / READ_RATE) * 2) / 2);

export const EXAMPLE_BUTTONS = ['#load-example', '#load-ok', 'button#example'];
/** Otherwise the first button whose words load an example ("Load an example", "Load the example (three synthetic months)"). */
export const EXAMPLE_WORDS = /\b(load|try|use|show)\b[^.]{0,20}\bexample\b/i;

const firstSentence = (s) => String(s).split(/(?<=[.!?])\s/)[0].trim();

const KICKER = { tool: 'New free tool', post: 'From our open research' };
const CLOSE = {
  tool: ['Free and open source (MIT).', 'No account needed.'],
  post: ['Open data and code.', 'Written by AI agents under the owner\'s direction.'],
};
const SMALL_PRINT = {
  tool: 'Estimates from the inputs shown, not legal, tax, financial or professional advice. Check the numbers before relying on them.',
  post: 'Open research: read the method and the limits before relying on a result.',
};

/**
 * The video's plan for one item (pure): scenes in order, with the on-screen
 * text, what is narrated, and the post text that goes with the upload.
 * `figure` is a { value, label } read off the page, or null; `clicked` says
 * an example button was pressed and `focused` that the page's answer (a
 * results heading, an output, a chart or table) was found and scrolled to.
 * The captions claim no more than those three say.
 */
export function storyboard(item, { figure = null, clicked = false, focused = false } = {}) {
  const tiktok = variant(item, byId('tiktok'));
  const youtube = variant(item, byId('youtube'));
  const name = item.type === 'tool' ? item.name : clip(item.name, 90);
  const what = clip(firstSentence(item.description), 160);
  const showing = item.type === 'tool'
    ? (clicked ? 'Its own worked example, loaded on the real page' : 'The real page, on its worked-example defaults')
    : (focused ? 'The write-up, scrolled to its main result' : 'The full write-up');
  const answer = figure
    ? `${figure.value}${figure.label ? `: ${figure.label}` : ''}`
    : item.type === 'tool'
      ? (focused ? 'The answer, worked out on the page' : 'Worked out on the page')
      : (focused ? 'The main result' : 'Method, data and limits are in the write-up');
  const close = CLOSE[item.type];
  return {
    id: item.id,
    slug: item.slug,
    type: item.type,
    url: item.url,
    scenes: [
      { role: 'hook', kind: 'card', seconds: readable(SECONDS.hook, name), kicker: KICKER[item.type], text: name, say: `${KICKER[item.type]}: ${name}.` },
      { role: 'what', kind: 'card', seconds: readable(SECONDS.what, what), kicker: name, text: what, say: what },
      { role: 'scroll', kind: 'page', seconds: SECONDS.scroll, caption: showing, say: '' },
      { role: 'hold', kind: 'page', seconds: SECONDS.hold, caption: clip(answer, 90), say: figure ? `${figure.value}. ${figure.label}.` : '' },
      { role: 'close', kind: 'card', seconds: readable(SECONDS.close, `${close.join(' ')} ${SMALL_PRINT[item.type]}`), kicker: name, text: close.join(' '), small: SMALL_PRINT[item.type], say: `${close.join(' ')} Link in the description.` },
    ],
    post: {
      tiktok: { text: tiktok.text, link: tiktok.link },
      youtube: { title: youtube.title, description: youtube.text, link: youtube.link },
    },
  };
}

/** Start and end of each scene once narration (seconds per scene, or null) is known. */
export function timeline(scenes, voiced = []) {
  let t = 0;
  return scenes.map((s, i) => {
    const seconds = Math.max(s.seconds, voiced[i] ? voiced[i] + 0.5 : 0);
    const out = { ...s, start: t, end: t + seconds, seconds };
    t += seconds;
    return out;
  });
}

const stamp = (sec) => {
  const ms = Math.round(sec * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** SubRip captions: one cue per scene, its on-screen words. */
export function toSrt(timed) {
  return timed.map((s, i) => {
    const words = s.kind === 'card' ? [s.text, s.small].filter(Boolean).join('\n') : s.caption;
    return `${i + 1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${words}\n`;
  }).join('\n');
}

export function postMarkdown(board) {
  const { tiktok, youtube } = board.post;
  return [
    `# ${board.id}`, '',
    'Video: `short.mp4` (1080x1920, captions burned in; `short.srt` for platforms that take a caption file).', '',
    '## TikTok caption', '', '```', tiktok.text, '```', '', `Bio link: ${tiktok.link}`, '',
    '## YouTube Short', '', `**Title:** ${youtube.title}`, '', '```', youtube.description, '```', '',
  ].join('\n');
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONT_CSS = () => `
@font-face { font-family: Inter; font-weight: 500; src: url("${pathToFileURL(path.join(FONTS, 'Inter-Medium.ttf'))}"); }
@font-face { font-family: Inter; font-weight: 600; src: url("${pathToFileURL(path.join(FONTS, 'Inter-SemiBold.ttf'))}"); }
@font-face { font-family: Inter Display; font-weight: 700; src: url("${pathToFileURL(path.join(FONTS, 'InterDisplay-Bold.ttf'))}"); }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${W}px; height: ${H}px; font-family: Inter, sans-serif; }`;

/** A full-frame card in the site's night-field look (platform/pages/sharecard.mjs). */
export function cardHtml(scene) {
  const size = scene.role === 'hook' ? 112 : scene.text.length > 110 ? 64 : 76;
  return `<!doctype html><meta charset="utf-8"><style>${FONT_CSS()}
body { background: radial-gradient(900px 700px at 15% 10%, rgba(127,227,198,.28), transparent 70%),
  radial-gradient(900px 800px at 90% 85%, rgba(142,162,255,.30), transparent 70%), linear-gradient(160deg, #08101f, #10204a);
  color: #eef2f8; display: flex; flex-direction: column; justify-content: center; padding: 0 96px; position: relative; overflow: hidden; }
body::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(140,170,255,.07) 1px, transparent 1px),
  linear-gradient(90deg, rgba(140,170,255,.07) 1px, transparent 1px); background-size: 72px 72px; }
.kicker { font-weight: 600; font-size: 44px; color: #7fe3c6; letter-spacing: .02em; margin-bottom: 40px; position: relative; }
.text { font-family: "Inter Display", Inter, sans-serif; font-weight: 700; font-size: ${size}px; line-height: 1.12; position: relative; }
.small { font-weight: 500; font-size: 34px; line-height: 1.4; color: #b6c2d3; margin-top: 64px; position: relative; }
.site { position: absolute; left: 96px; right: 96px; bottom: 140px; font-weight: 600; font-size: 34px; color: #8ea2ff; }
</style><body><div class="kicker">${esc(scene.kicker)}</div><div class="text">${esc(scene.text)}</div>
${scene.small ? `<div class="small">${esc(scene.small)}</div>` : ''}<div class="site">Link in the description</div></body>`;
}

/** A transparent overlay: one caption band near the bottom, over the page. */
export function captionHtml(caption) {
  return `<!doctype html><meta charset="utf-8"><style>${FONT_CSS()}
body { background: transparent; position: relative; }
.band { position: absolute; left: 60px; right: 60px; bottom: 210px; background: rgba(8,13,26,.86); color: #eef2f8; border-radius: 28px;
  padding: 34px 44px; font-weight: 600; font-size: 50px; line-height: 1.2; border-left: 10px solid #7fe3c6; }
</style><body><div class="band">${esc(caption)}</div></body>`;
}

/** ffmpeg y-expression: ease the crop window from 0 to `to` over `dur` seconds (smoothstep), then hold. */
export function scrollExpr(to, dur) {
  if (to <= 0) return '0';
  return `${to}*(3*pow(min(1,t/${dur}),2)-2*pow(min(1,t/${dur}),3))`;
}

// ---------------------------------------------------------------- capture

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const spec = process.env.PLAYWRIGHT || 'playwright';
  try { return require(spec); } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}

/**
 * Open the page on a phone-sized viewport, load its example, find the answer
 * and take one tall screenshot from the top to just past the answer.
 * Returns { png, scrollTo (device px), clicked, focused, figure }.
 */
export async function capturePage(browser, url, png) {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE, reducedMotion: 'reduce', colorScheme: 'light' });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(800);
    let clicked = false;
    for (const button of [...EXAMPLE_BUTTONS.map((sel) => page.locator(sel)), page.locator('button', { hasText: EXAMPLE_WORDS })]) {
      const el = button.first();
      if (await el.isVisible().catch(() => false)) { await el.click(); clicked = true; break; }
    }
    await page.waitForTimeout(clicked ? 1500 : 300);
    const found = await page.evaluate(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const top = (el) => el.getBoundingClientRect().top + window.scrollY;
      const skip = (el) => el.closest('header, nav, footer, form, fieldset, details:not([open])');
      const height = document.documentElement.scrollHeight;
      // The figure in a block: its largest-type short text that is mostly digits and units ("432 of 870",
      // "$21.34", "69.9%"), never a numbered step ("1. Import"), with the text beside it as its label.
      const figureIn = (block) => {
        let best = null;
        for (const el of block.querySelectorAll('*')) {
          if (el.childElementCount || !visible(el)) continue;
          const text = el.textContent.trim();
          if (!/\d/.test(text) || text.length > 24 || /^\d+[.)]\s/.test(text) || (text.match(/\p{L}/gu) || []).length / text.length > 0.4) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (best && size <= best.size) continue;
          // The label: the rest of the figure's own tile ("145 lines in the books"), else the line after it.
          const squash = (t) => String(t || '').replace(/\s+/g, ' ').trim();
          const rest = squash(el.parentElement?.textContent.replace(text, ''));
          const next = squash(el.nextElementSibling?.textContent);
          const label = rest && rest.length <= 70 ? rest : next.length <= 70 ? next : '';
          best = { value: text, label, size, y: top(el) };
        }
        return best;
      };
      // Named answers: a results heading's section, or an output / live region with text in it.
      const heading = /^(\d+\.\s*)?(results?|your (result|answer|plan|schedule|estimate|numbers|books)|answer|summary|totals?|estimate|takeoff|where the books stand|(lumber|material) (order|list))\b/i;
      const named = [
        ...[...document.querySelectorAll('h2, h3, legend')].filter((el) => visible(el) && !skip(el) && heading.test(el.textContent.trim()))
          .map((el) => el.closest('section, .card, .panel') || el),
        ...[...document.querySelectorAll('output, [aria-live]')].filter((el) => visible(el) && !skip(el) && el.textContent.trim()),
      ];
      // The answer is the named block showing the most prominent figure; failing any figure, the first named block.
      let target = null;
      let figure = null;
      for (const block of named) {
        const f = figureIn(block);
        if (f && (!figure || f.size > figure.size)) { target = block; figure = f; }
      }
      target = target || named.sort((a, b) => top(a) - top(b))[0] || null;
      if (!target) {
        const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
        target = [...document.querySelectorAll('svg, canvas, table, figure, main img, article img')]
          .filter((el) => visible(el) && !skip(el) && area(el) > 20000)
          .sort((a, b) => top(a) - top(b))[0];
      }
      if (!target) {
        // Nothing to call an answer: scroll to the first section heading so the page still moves, and say less.
        const h2 = [...document.querySelectorAll('main h2, article h2, h2')].find((el) => visible(el) && !skip(el));
        return { y: h2 ? Math.max(0, top(h2) - 24) : 0, focused: false, figure: null, height };
      }
      // Hold on the figure itself (with a little of what is above it), else on the top of the answer.
      const y = figure ? figure.y - innerHeight * 0.3 : top(target) - 24;
      return { y: Math.max(0, y), focused: true, figure: figure && { value: figure.value, label: figure.label }, height };
    });
    // At most SCROLL_SCREENS screens of travel: a longer scroll is a blur at this pace, and a taller
    // screenshot passes Chromium's texture limit. A long page's video starts part-way down.
    const bottom = Math.max(PHONE.height, Math.min(found.height, found.y + PHONE.height));
    const from = Math.max(0, bottom - (SCROLL_SCREENS + 1) * PHONE.height);
    await page.screenshot({ path: png, clip: { x: 0, y: from, width: PHONE.width, height: bottom - from }, fullPage: true });
    return { png, scrollTo: Math.round((bottom - PHONE.height - from) * SCALE), clicked, focused: found.focused, figure: found.figure && found.figure.value ? found.figure : null };
  } finally {
    await ctx.close();
  }
}

async function shoot(browser, html, png, { transparent = false } = {}) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: png, omitBackground: transparent });
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------- render

const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
const VIDEO = ['-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p'];
const AUDIO = ['-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '1'];

function voice(text, wav, { piper, model }) {
  execFileSync(piper, ['--model', model, '--output_file', wav, '--sentence_silence', '0.25'], { input: `${text}\n`, stdio: ['pipe', 'ignore', 'ignore'] });
  return duration(wav);
}

/** Render one item into `dir`. Returns the manifest row. */
export async function renderItem(browser, item, dir, { base = null, piper = null, model = null } = {}) {
  await fs.mkdir(dir, { recursive: true });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'short-'));
  try {
    const url = base ? item.url.replace(BASE_URL, base.replace(/\/?$/, '/')) : item.url;
    const shot = await capturePage(browser, url, path.join(tmp, 'page.png'));
    const board = storyboard(item, shot);

    const voiced = board.scenes.map((s, i) => (piper && model && s.say ? voice(s.say, path.join(tmp, `say${i}.wav`), { piper, model }) : null));
    const timed = timeline(board.scenes, voiced);

    const parts = [];
    for (const [i, s] of timed.entries()) {
      const part = path.join(tmp, `part${i}.mp4`);
      const audio = voiced[i]
        ? ['-i', path.join(tmp, `say${i}.wav`)]
        : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono'];
      const pad = `apad=whole_dur=${s.seconds.toFixed(3)}`;
      if (s.kind === 'card') {
        const png = path.join(tmp, `card${i}.png`);
        await shoot(browser, cardHtml(s), png);
        run(['-loop', '1', '-framerate', String(FPS), '-t', s.seconds.toFixed(3), '-i', png, ...audio,
          '-filter_complex', `[0:v]format=yuv420p,fade=t=in:st=0:d=0.25[v];[1:a]${pad}[a]`, '-map', '[v]', '-map', '[a]',
          '-t', s.seconds.toFixed(3), ...VIDEO, ...AUDIO, part]);
      } else {
        const cap = path.join(tmp, `cap${i}.png`);
        await shoot(browser, captionHtml(s.caption), cap, { transparent: true });
        // The scroll scene eases from the top to the answer; the hold scene sits on the answer.
        const y = s.role === 'scroll' ? scrollExpr(shot.scrollTo, Math.max(1, s.seconds - 1.2)) : String(shot.scrollTo);
        run(['-loop', '1', '-framerate', String(FPS), '-t', s.seconds.toFixed(3), '-i', shot.png,
          '-loop', '1', '-framerate', String(FPS), '-t', s.seconds.toFixed(3), '-i', cap, ...audio,
          '-filter_complex', `[0:v]crop=${W}:${H}:0:'${y}'[p];[p][1:v]overlay=0:0,format=yuv420p[v];[2:a]${pad}[a]`,
          '-map', '[v]', '-map', '[a]', '-t', s.seconds.toFixed(3), ...VIDEO, ...AUDIO, part]);
      }
      parts.push(part);
    }
    const list = path.join(tmp, 'parts.txt');
    await fs.writeFile(list, parts.map((p) => `file '${p}'`).join('\n'));
    const mp4 = path.join(dir, 'short.mp4');
    run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', mp4]);
    const holdAt = timed.find((s) => s.role === 'hold').start + 1;
    run(['-ss', holdAt.toFixed(2), '-i', mp4, '-frames:v', '1', path.join(dir, 'poster.png')]);
    await fs.writeFile(path.join(dir, 'short.srt'), toSrt(timed));
    await fs.writeFile(path.join(dir, 'post.md'), postMarkdown(board));
    const stat = await fs.stat(mp4);
    return {
      id: board.id, url, dir: path.basename(dir), seconds: Number(duration(mp4).toFixed(2)), bytes: stat.size,
      example_loaded: shot.clicked, answer_found: shot.focused, figure: shot.figure, narrated: voiced.some(Boolean),
      captions: timed.map((s) => (s.kind === 'card' ? s.text : s.caption)),
    };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- cli

export function parseArgs(argv) {
  const [cmd = 'plan', ...rest] = argv;
  const opts = { cmd, days: 3, postDays: 7, max: 5, slug: null, out: null, base: null, piper: null, model: null, today: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => rest[++i];
    if (a === '--days') opts.days = Number(next());
    else if (a === '--post-days') opts.postDays = Number(next());
    else if (a === '--max') opts.max = Number(next());
    else if (a === '--slug') opts.slug = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out') opts.out = next();
    else if (a === '--base') opts.base = next();
    else if (a === '--piper') opts.piper = next();
    else if (a === '--model') opts.model = next();
    else if (a === '--today') opts.today = next();
    else throw new Error(`unknown option ${a}`);
  }
  if (!['plan', 'render'].includes(opts.cmd)) throw new Error(`unknown command ${opts.cmd} (plan | render)`);
  if (opts.cmd === 'render' && !opts.out) throw new Error('render needs --out <dir>');
  if (Boolean(opts.piper) !== Boolean(opts.model)) throw new Error('--piper and --model go together');
  return opts;
}

/** Items named by slug: a venture's page, else a post in docs/posts. */
export async function itemsBySlug(slugs, { root = REPO_ROOT, posts = loadPosts(root) } = {}) {
  const out = [];
  for (const slug of slugs) {
    const html = await fs.readFile(path.join(root, 'ventures', slug, 'index.html'), 'utf8').catch(() => null);
    const meta = html && readMeta(html);
    if (meta) { out.push(toolItem(slug, '', meta)); continue; }
    const post = posts.find((p) => p.slug === slug);
    if (post) { out.push(postItem(post)); continue; }
    throw new Error(`no tool page or post called "${slug}"`);
  }
  return out;
}

async function main(argv) {
  const opts = parseArgs(argv);
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const items = (opts.slug ? await itemsBySlug(opts.slug) : await gatherItems({ today, days: opts.days, postDays: opts.postDays })).slice(0, opts.max);
  if (!items.length) { console.log('No items in the window: nothing to render.'); return; }
  if (opts.cmd === 'plan') {
    for (const it of items) {
      const b = storyboard(it);
      console.log(`${b.id}  ${b.url}`);
      for (const s of timeline(b.scenes)) console.log(`  ${s.start.toFixed(1).padStart(5)}s  ${s.role.padEnd(6)} ${s.kind === 'card' ? s.text : s.caption}`);
    }
    return;
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const manifest = { generated: new Date().toISOString(), today, videos: [], failed: [] };
  try {
    for (const it of items) {
      const dir = path.join(opts.out, it.slug);
      try {
        const row = await renderItem(browser, it, dir, opts);
        manifest.videos.push(row);
        console.log(`rendered ${row.id}: ${row.seconds}s, ${(row.bytes / 1e6).toFixed(1)} MB${row.figure ? `, figure "${row.figure.value}"` : ''}`);
      } catch (err) {
        manifest.failed.push({ id: it.id, error: String(err.message || err).slice(0, 300) });
        console.error(`failed ${it.id}: ${err.message || err}`);
      }
    }
  } finally {
    await browser.close();
  }
  await fs.mkdir(opts.out, { recursive: true });
  await fs.writeFile(path.join(opts.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (!manifest.videos.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => { console.error(err.message || err); process.exit(2); });
}
