// The home page's motion and imagery: the animated hero, the moving shelf of
// tool names, and the showcase of real tools captured by `showcase/capture.mjs`.
//
// Kept out of build.mjs so the visual layer can change without touching the
// hub's search, counting and saved-bid code, and so it can be tested alone.
//
// Three rules hold everywhere below:
//   - Everything is readable and clickable without JavaScript. Script only adds
//     motion to markup that is already complete.
//   - `prefers-reduced-motion: reduce` gets a still page: no drifting canvas,
//     no marquee, no reveals, and the video waits for a click.
//   - Nothing is fetched from another host. The stills and the recording are
//     files this build publishes, and the video loads only once it is on screen.
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Where the captured stills and recording sit in the repo and on the site. */
export const SHOWCASE_SOURCE = path.join(HERE, 'showcase');
export const SHOWCASE_DIR = 'showcase';

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The showcase manifest, keeping only stills of tools this build publishes, so
 * a renamed or withdrawn tool drops out instead of becoming a dead card.
 */
export function loadShowcase(publishedSlugs, source = SHOWCASE_SOURCE) {
  const file = path.join(source, 'manifest.json');
  if (!existsSync(file)) return { shots: [], reel: null };
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const published = new Set(publishedSlugs);
  const shots = (manifest.shots ?? []).filter((s) => published.has(s.slug) && existsSync(path.join(source, s.file)));
  const reel = manifest.reel && ['webm', 'mp4', 'poster'].every((k) => existsSync(path.join(source, manifest.reel[k])))
    ? { ...manifest.reel, tools: (manifest.reel.tools ?? []).filter((slug) => published.has(slug)) }
    : null;
  return { shots, reel };
}

/** Publish the files the showcase names, and nothing else from that folder. */
export async function copyShowcase(outDir, showcase, source = SHOWCASE_SOURCE) {
  const files = [...showcase.shots.map((s) => s.file)];
  if (showcase.reel) files.push(showcase.reel.webm, showcase.reel.mp4, showcase.reel.poster);
  if (!files.length) return 0;
  await fs.mkdir(path.join(outDir, SHOWCASE_DIR), { recursive: true });
  for (const file of files) await fs.copyFile(path.join(source, file), path.join(outDir, SHOWCASE_DIR, file));
  return files.length;
}

/**
 * Two rows of tool names drifting in opposite directions. The second copy of
 * each row exists only to make the loop seamless, so it is hidden from
 * assistive technology and carries no links: a crawler reading the page sees
 * each tool linked once, not twice with the same anchor text.
 */
export function renderMarquee(rows) {
  const filled = rows.filter((row) => row.length);
  if (!filled.length) return '';
  const pill = (s, hidden) => (hidden
    ? `<li><span>${esc(s.name)}</span></li>`
    : `<li><a href="${esc(s.slug)}/" data-tool="${esc(s.slug)}">${esc(s.name)}</a></li>`);
  return `    <section class="marquee" aria-label="A sample of the tools">
${filled
  .map(
    (row, i) => `      <div class="marquee-row${i % 2 ? ' reverse' : ''}">
        <ul class="marquee-track">${row.map((s) => pill(s, false)).join('')}</ul>
        <ul class="marquee-track" aria-hidden="true">${row.map((s) => pill(s, true)).join('')}</ul>
      </div>`,
  )
  .join('\n')}
    </section>`;
}

/** The recording in a browser frame beside a strip of stills, each a link to its tool. */
export function renderShowcaseSection({ shots, reel }, titleFor = (slug) => slug) {
  if (!shots.length && !reel) return '';
  const video = reel
    ? `      <figure class="reel">
        <div class="frame">
          <div class="frame-bar" aria-hidden="true"><i></i><i></i><i></i><span>${esc(reel.tools.map(titleFor).slice(0, 2).join(' · '))}…</span></div>
          <video class="reel-video" muted loop playsinline preload="none" width="960" height="600"
                 poster="${SHOWCASE_DIR}/${esc(reel.poster)}" data-webm="${SHOWCASE_DIR}/${esc(reel.webm)}" data-mp4="${SHOWCASE_DIR}/${esc(reel.mp4)}"
                 aria-label="Screen recording: ${esc(reel.tools.map(titleFor).join(', '))}, each loading its worked example">
            <source src="${SHOWCASE_DIR}/${esc(reel.webm)}" type="video/webm">
            <source src="${SHOWCASE_DIR}/${esc(reel.mp4)}" type="video/mp4">
          </video>
        </div>
        <figcaption>Recorded from the live tools: each one loads its own worked example and shows the answer.</figcaption>
      </figure>`
    : '';
  const gallery = shots.length
    ? `      <ul class="shots">
${shots
  .map(
    (s) => `        <li class="shot"><a href="${esc(s.slug)}/" data-tool="${esc(s.slug)}">
          <img src="${SHOWCASE_DIR}/${esc(s.file)}" width="960" height="600" loading="lazy" decoding="async"
               alt="${esc(titleFor(s.slug))} with its worked example loaded">
          <span class="shot-name">${esc(titleFor(s.slug))}</span>
          <span class="shot-cap">${esc(s.caption)}</span>
        </a></li>`,
  )
  .join('\n')}
      </ul>`
    : '';
  return `    <section class="band showcase" id="showcase" aria-labelledby="showcase-h">
      <p class="section-eyebrow">See it working</p>
      <h2 id="showcase-h">Real answers, not demos</h2>
      <p class="band-lede">Every picture here is a tool on this site with its example loaded. Open one and it does the same for your numbers, in your browser.</p>
${video}
${gallery}
    </section>`;
}

export const HOME_MOTION_CSS = `
    /* ---- Motion and imagery (showcase.mjs) ---------------------------------- */
    /* The hero is dark in both colour schemes. Its tokens are redefined here so
       the search, results and stats inside it keep their own contrast. */
    .hero { position: relative; overflow: hidden; isolation: isolate;
            --bg: #0b1626; --panel: rgba(20, 28, 48, .78); --ink: #eef2f8; --muted: #b6c2d3;
            --soft: #98a5b8; --line: rgba(148, 170, 210, .24); --accent: #a8c7f0; --accent-ink: #07121a;
            --hero-2: #b4c6de; color: var(--ink);
            background: radial-gradient(1200px 600px at 50% 120%, #142a4a 0%, transparent 60%), #0b1626;
            border-bottom: 1px solid #1e2c42; }
    .hero a { color: var(--accent); }
    .hero-canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; display: block; }
    /* Soft colour from radial gradients, not a blur filter. A filter: blur()
       over blended, moving circles re-rasterised the whole hero every frame
       (5 fps on a throttled laptop CPU, 2026-11-03); gradients on their own
       layers move on the compositor at no paint cost. */
    .aurora { position: absolute; inset: -20%; z-index: -2; opacity: .35; pointer-events: none; }
    .aurora i { position: absolute; width: 46vw; height: 46vw; max-width: 720px; max-height: 720px; border-radius: 50%;
                --c: #1f4e8c; background: radial-gradient(closest-side, var(--c) 35%, transparent);
                will-change: transform; animation: drift 22s ease-in-out infinite alternate; }
    .aurora i:nth-child(1) { left: 2%; top: 4%; }
    .aurora i:nth-child(2) { --c: #3a6ea5; right: 0; top: -8%; animation-duration: 28s; animation-delay: -6s; }
    .aurora i:nth-child(3) { --c: #5b7799; left: 34%; bottom: -14%; animation-duration: 34s; animation-delay: -12s; opacity: .7; }
    .hero.paused .aurora i { animation-play-state: paused; }
    @keyframes drift { 0% { transform: translate(0, 0) scale(1); } 50% { transform: translate(6vw, 4vw) scale(1.15); }
                       100% { transform: translate(-4vw, 6vw) scale(.92); } }
    .hero::after { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
                   background-image: linear-gradient(rgba(140,170,255,.07) 1px, transparent 1px),
                                     linear-gradient(90deg, rgba(140,170,255,.07) 1px, transparent 1px);
                   background-size: 44px 44px;
                   -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 75%);
                           mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 75%); }
    .hero h1 { font-size: clamp(2.3rem, 6.4vw, 4.6rem); max-width: 18ch; }
    .grad { background: linear-gradient(100deg, #a8c7f0 0%, #b4c6de 30%, #dfe8f5 55%, #a8c7f0 80%);
            -webkit-background-clip: text; background-clip: text; color: transparent; }
    .ticker { margin: 0 0 18px; font-size: clamp(1rem, 1.8vw, 1.2rem); color: var(--muted); }
    .ticker b { display: inline-block; color: var(--ink); font-weight: 750;
                border-bottom: 2px solid var(--accent); transition: opacity .35s, transform .35s; }
    @media (min-width: 720px) { .ticker b { min-width: 6ch; } }
    /* The words turn, so the line is as tall as its longest one before the
       first paint: a hidden copy of the sentence with that word (data-longest,
       set by the build) shares the grid cell with the real one. Bold all
       through, so it errs tall. The motion script's fit() then pins the exact
       height. Not under reduced motion, where the word never changes. */
    @media (prefers-reduced-motion: no-preference) {
      .ticker[data-longest] { display: grid; }
      .ticker[data-longest] > span, .ticker[data-longest]::after { grid-area: 1 / 1; }
      .ticker[data-longest]::after { content: "Built for " attr(data-longest) " and anyone with numbers to run.";
                                     visibility: hidden; font-weight: 750; pointer-events: none;
                                     padding-bottom: 2px; /* the word's underline */ }
    }
    .ticker b.out { opacity: 0; transform: translateY(-.4em); }
    .hero .stats { background: rgba(14, 20, 38, .72); border-color: var(--line); }
    .hero .stats div { border-color: var(--line); }
    .hero .stats dd a { color: var(--ink); }
    .hero .search input { background: rgba(10, 16, 32, .75); border-color: rgba(148,170,210,.35);
                          box-shadow: 0 0 0 0 rgba(168,199,240,0); transition: box-shadow .25s, border-color .25s; }
    .hero .search input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(168,199,240,.18), 0 10px 40px rgba(58,110,165,.25); outline: none; }
    .hero .search button { box-shadow: 0 6px 24px rgba(168,199,240,.25); }

    /* The moving shelf. Without motion it is a row you can scroll sideways. */
    .marquee { margin: 0; padding: 18px 0; overflow: hidden; display: grid; gap: 10px;
               border-bottom: 1px solid var(--line); background: var(--panel);
               -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
                       mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
    .marquee-row { display: flex; width: max-content; will-change: transform; }
    .marquee-track { list-style: none; margin: 0; padding: 0 10px 0 0; display: flex; gap: 10px; }
    .marquee-track a, .marquee-track span { display: inline-block; white-space: nowrap; padding: 8px 15px; border-radius: 999px;
                       border: 1px solid var(--line); background: var(--bg); color: var(--ink);
                       text-decoration: none; font-weight: 600; font-size: .9rem; transition: border-color .2s, color .2s, transform .2s; }
    .marquee-track a:hover, .marquee-track a:focus-visible { border-color: var(--accent); color: var(--accent); transform: translateY(-2px); }
    .marquee-row { animation: slide 70s linear infinite; }
    .marquee-row.reverse { animation-direction: reverse; animation-duration: 85s; }
    .marquee:hover .marquee-row, .marquee:focus-within .marquee-row { animation-play-state: paused; }
    @keyframes slide { to { transform: translateX(-50%); } }

    /* The showcase: a framed recording and a strip of stills. The frame tilts
       back from its bottom edge: hinged at the top, the tilt brought the lower
       edge toward the viewer and drew it over the caption beneath. */
    .reel { margin: 24px 0 0; }
    .frame { border-radius: 16px; overflow: hidden; border: 1px solid var(--line); background: #0b1020;
             box-shadow: 0 30px 80px -30px rgba(40, 60, 160, .55), 0 0 0 1px rgba(255,255,255,.03);
             transform: perspective(1600px) rotateX(4deg); transform-origin: 50% 100%; transition: transform .6s cubic-bezier(.2,.8,.2,1); }
    /* Pivot on the bottom edge: the top leans away and the frame stays inside
       its own box. Pivoting on the top edge swung the bottom toward the viewer,
       wider than the column and down over the caption under it. */
    .reel:hover .frame { transform: perspective(1600px) rotateX(0); }
    .frame-bar { display: flex; align-items: center; gap: 7px; padding: 10px 14px; background: #121a2e; color: #b6c2d3; font-size: .78rem; }
    .frame-bar i { width: 11px; height: 11px; border-radius: 50%; background: #ff5f57; }
    .frame-bar i:nth-child(2) { background: #febc2e; } .frame-bar i:nth-child(3) { background: #28c840; }
    .frame-bar span { margin-left: 10px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .reel-video { display: block; width: 100%; height: auto; aspect-ratio: 960 / 600; background: #0b1020; }
    .reel figcaption { margin-top: 14px; font-size: .85rem; color: var(--muted); }
    .shots { list-style: none; padding: 4px 2px 18px; margin: 26px 0 0; display: grid; grid-auto-flow: column;
             grid-auto-columns: minmax(280px, 34%); gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory;
             scrollbar-width: thin; }
    .shot { scroll-snap-align: start; }
    .shot a { display: block; height: 100%; border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
              background: var(--panel); color: var(--ink); text-decoration: none;
              transition: transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s, border-color .35s; }
    .shot a:hover, .shot a:focus-visible { transform: translateY(-6px) rotate(-.4deg); border-color: var(--accent);
                                           box-shadow: 0 22px 50px -24px rgba(40, 60, 160, .55); }
    .shot img { display: block; width: 100%; height: auto; aspect-ratio: 960 / 600; object-fit: cover;
                border-bottom: 1px solid var(--line); transition: transform .6s; }
    .shot a:hover img { transform: scale(1.04); }
    .shot-name { display: block; padding: 12px 14px 0; font-weight: 700; }
    .shot-cap { display: block; padding: 4px 14px 14px; font-size: .86rem; color: var(--muted); line-height: 1.45; }

    /* A soft light that follows the pointer across a card. */
    .cat, .pillar, .featured li, .step { position: relative; }
    .cat::before, .pillar::before, .featured li::before, .step::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0;
      background: radial-gradient(360px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%);
      transition: opacity .3s; }
    .cat:hover::before, .pillar:hover::before, .featured li:hover::before, .step:hover::before { opacity: 1; }
    .cat, .featured li { transition: border-color .2s, transform .25s, box-shadow .25s; }
    .cat:hover, .featured li:hover { transform: translateY(-3px); box-shadow: 0 18px 40px -26px rgba(20, 40, 120, .45); }

    /* Reveal on scroll, only once script has said it is running. */
    .motion .reveal { opacity: 0; transform: translateY(26px); transition: opacity .7s ease, transform .7s cubic-bezier(.2,.8,.2,1);
                      transition-delay: var(--delay, 0s); }
    .motion .reveal.in { opacity: 1; transform: none; }

    @media (prefers-reduced-motion: reduce) {
      .aurora i, .marquee-row { animation: none; }
      .marquee { overflow-x: auto; }
      .marquee-track[aria-hidden="true"] { display: none; }
      .frame, .reel:hover .frame { transform: none; }
      .motion .reveal { opacity: 1; transform: none; transition: none; }
      .cat, .featured li, .shot a, .shot img, .marquee-track a { transition: none; }
    }
    @media (max-width: 640px) {
      .shots { grid-auto-columns: 82%; }
      .frame { transform: none; }
    }`;

/** The audience name with the most characters: the hero ticker reserves the
 *  height of its sentence with this word before the words start turning. */
export function longestWord(words) {
  return words.reduce((best, w) => (w.length > best.length ? w : best), '');
}

/** Hero decoration: the drifting colour and the canvas the script draws on. */
export const HERO_BACKDROP_HTML = `    <div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
    <canvas class="hero-canvas" aria-hidden="true"></canvas>`;

/**
 * The motion script. Plain, dependency-free, and a no-op where motion is
 * unwanted beyond drawing the canvas once.
 */
export const HOME_MOTION_SCRIPT = `
    (() => {
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const root = document.documentElement;

      // ---- Hero constellation ----------------------------------------------
      // A field of drifting points joined when close, which lean toward the
      // pointer. Paused while the hero is off screen or the tab is hidden.
      const canvas = document.querySelector('.hero-canvas');
      if (canvas && canvas.getContext) {
        const ctx = canvas.getContext('2d');
        const colours = ['168,199,240', '180,198,222', '140,165,200'];
        let w = 0, h = 0, dpr = 1, points = [], running = false, visible = true, frame = 0;
        const pointer = { x: -9999, y: -9999 };
        const size = () => {
          const box = canvas.getBoundingClientRect();
          // Drawn at CSS pixels: soft dots need no retina detail, and a 2x
          // canvas is four times the pixels to clear, draw and upload each frame.
          dpr = 1;
          w = box.width; h = box.height;
          canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const count = Math.min(90, Math.round((w * h) / 11000));
          points = Array.from({ length: count }, (_, i) => ({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
            r: Math.random() * 1.6 + .6, c: colours[i % colours.length],
          }));
        };
        // Lines are batched into a few paths by strength, and the dots' glow
        // is a wider faint disc, not shadowBlur: a stroke per pair and a
        // blurred shadow per dot cost most of a frame on a slow laptop.
        const bands = 4, reach = 130, reach2 = reach * reach;
        const draw = (step = 1) => {
          ctx.clearRect(0, 0, w, h);
          for (const p of points) {
            const dx = pointer.x - p.x, dy = pointer.y - p.y, d = Math.hypot(dx, dy);
            if (d < 200 && d > 1) { p.vx += dx / d * .012 * step; p.vy += dy / d * .012 * step; }
            p.vx *= Math.pow(.992, step); p.vy *= Math.pow(.992, step);
            p.x += p.vx * step; p.y += p.vy * step;
            if (p.x < 0 || p.x > w) p.vx *= -1;
            if (p.y < 0 || p.y > h) p.vy *= -1;
          }
          const paths = Array.from({ length: bands }, () => new Path2D());
          for (let i = 0; i < points.length; i++) {
            const a = points[i];
            for (let j = i + 1; j < points.length; j++) {
              const b = points[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
              if (d2 < reach2) {
                const band = Math.min(bands - 1, Math.floor((1 - Math.sqrt(d2) / reach) * bands));
                paths[band].moveTo(a.x, a.y); paths[band].lineTo(b.x, b.y);
              }
            }
          }
          ctx.lineWidth = 1;
          paths.forEach((path, band) => {
            ctx.strokeStyle = 'rgba(' + colours[0] + ',' + (0.22 * (band + .5) / bands).toFixed(3) + ')';
            ctx.stroke(path);
          });
          for (const c of colours) {
            const glow = new Path2D(), dot = new Path2D();
            for (const p of points) {
              if (p.c !== c) continue;
              glow.moveTo(p.x + p.r * 3, p.y); glow.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
              dot.moveTo(p.x + p.r, p.y); dot.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            }
            ctx.fillStyle = 'rgba(' + c + ',.12)'; ctx.fill(glow);
            ctx.fillStyle = 'rgba(' + c + ',.9)'; ctx.fill(dot);
          }
        };
        // About 30 frames a second is plenty for a slow drift, and halves the work.
        let last = 0;
        const loop = (now) => {
          if (!running) return;
          frame = requestAnimationFrame(loop);
          if (now - last < 30) return;
          draw(last ? Math.min(3, (now - last) / 16.7) : 1); last = now;
        };
        const update = () => {
          const should = !still && visible && !document.hidden;
          canvas.parentElement.classList.toggle('paused', !visible || document.hidden);
          if (should && !running) { running = true; last = 0; frame = requestAnimationFrame(loop); }
          if (!should && running) { running = false; cancelAnimationFrame(frame); }
        };
        size(); draw();
        let resizing = 0;
        addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(() => { size(); draw(); }, 150); });
        const hero = canvas.parentElement;
        hero.addEventListener('pointermove', (e) => {
          const box = canvas.getBoundingClientRect(); pointer.x = e.clientX - box.left; pointer.y = e.clientY - box.top;
        });
        hero.addEventListener('pointerleave', () => { pointer.x = pointer.y = -9999; });
        document.addEventListener('visibilitychange', update);
        new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(hero);
      }

      // ---- Rotating audience -------------------------------------------------
      const word = document.querySelector('.ticker b');
      const words = word ? JSON.parse(word.dataset.words || '[]') : [];
      if (word && words.length > 1 && !still) {
        // Hold the line at the height of its tallest word. On a phone "Roofers"
        // fits on one line and "Amazon sellers & KDP authors" takes two, so the
        // line wrapped and unwrapped as the words turned and moved the search
        // box, stats and the hero's backdrop 20 px up or down, for as long as
        // the page was open (CLS 0.087 on the hub under Lighthouse's devtools
        // throttling, 2026-11-11, docs/reports/polish-2026-11-11-wft-perf-hypotheses.md).
        // Measured here, at the end of the body, and not by an inline script
        // beside the line: an inline script waits for the stylesheets above it,
        // so the browser painted half a hero first (CLS 0.89 when tried).
        // System fonts, so no font swap changes the answer later.
        const line = word.closest('.ticker');
        const fit = () => {
          if (!line) return;
          const shown = word.textContent;
          let max = 0;
          line.style.minHeight = '';
          for (const w of words) { word.textContent = w; max = Math.max(max, line.offsetHeight); }
          word.textContent = shown;
          line.style.minHeight = max + 'px';
        };
        fit();
        let width = innerWidth, refit;
        addEventListener('resize', () => {
          if (innerWidth === width) return;
          width = innerWidth; clearTimeout(refit); refit = setTimeout(fit, 100);
        });
        let at = 0;
        setInterval(() => {
          if (document.hidden) return;
          word.classList.add('out');
          setTimeout(() => { at = (at + 1) % words.length; word.textContent = words[at]; word.classList.remove('out'); }, 350);
        }, 2400);
      }

      // ---- Count the headline numbers up once they are seen -----------------
      const counters = [...document.querySelectorAll('.stats dd a')];
      if (!still && 'IntersectionObserver' in window) {
        const run = (el) => {
          const target = Number(el.textContent.replace(/[^0-9]/g, ''));
          if (!target) return;
          const start = performance.now(), span = 1400;
          const step = (now) => {
            const t = Math.min(1, (now - start) / span), eased = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(target * eased).toLocaleString('en-US');
            if (t < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        };
        const seen = new IntersectionObserver((entries) => {
          for (const e of entries) if (e.isIntersecting) { run(e.target); seen.unobserve(e.target); }
        });
        counters.forEach((el) => seen.observe(el));
      }

      // ---- Reveal sections and cards as they scroll in ----------------------
      // Only what starts below the fold is hidden, and never for long: a
      // reader who does not scroll (a full-page capture, a link-preview
      // renderer, a search engine's renderer, print) would otherwise see a page
      // of empty bands. Everything still hidden after a few seconds, or when
      // the page is printed, is shown.
      if (!still && 'IntersectionObserver' in window) {
        root.classList.add('motion');
        const fold = innerHeight;
        const targets = [...document.querySelectorAll('.band > h2, .band > .band-lede, .cats > li, .featured > li, .pillar, .step, .rcard, .posts > li, .shot, .reel')]
          .filter((el) => el.getBoundingClientRect().top > fold);
        targets.forEach((el) => {
          el.classList.add('reveal');
          const index = [...el.parentElement.children].indexOf(el);
          el.style.setProperty('--delay', Math.min(index, 8) * 0.06 + 's');
        });
        const reveal = new IntersectionObserver((entries) => {
          for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
        }, { rootMargin: '0px 0px -8% 0px' });
        targets.forEach((el) => reveal.observe(el));
        const showAll = () => { targets.forEach((el) => el.classList.add('in')); reveal.disconnect(); };
        setTimeout(showAll, 4000);
        addEventListener('beforeprint', showAll);
      }

      // ---- Pointer light on cards -------------------------------------------
      // At most once a frame: pointer events can arrive faster than frames.
      let lit = null, litFrame = 0;
      document.addEventListener('pointermove', (e) => {
        lit = e;
        if (litFrame) return;
        litFrame = requestAnimationFrame(() => {
          litFrame = 0;
          const card = lit.target.closest && lit.target.closest('.cat, .pillar, .featured li, .step');
          if (!card) return;
          const box = card.getBoundingClientRect();
          card.style.setProperty('--mx', (lit.clientX - box.left) + 'px');
          card.style.setProperty('--my', (lit.clientY - box.top) + 'px');
        });
      }, { passive: true });

      // ---- The recording plays only while it is on screen --------------------
      const video = document.querySelector('.reel-video');
      if (video) {
        if (still || !('IntersectionObserver' in window)) {
          video.controls = true;
        } else {
          new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { video.preload = 'auto'; video.play().catch(() => { video.controls = true; }); }
            else video.pause();
          }, { threshold: 0.35 }).observe(video);
        }
      }
    })();`;
