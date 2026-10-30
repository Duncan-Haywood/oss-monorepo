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
            --bg: #080d1a; --panel: rgba(20, 28, 48, .78); --ink: #eef2f8; --muted: #b6c2d3;
            --soft: #98a5b8; --line: rgba(148, 170, 210, .24); --accent: #7fe3c6; --accent-ink: #07121a;
            --hero-2: #8ea2ff; color: var(--ink);
            background: radial-gradient(1200px 600px at 50% 120%, #10204a 0%, transparent 60%), #080d1a;
            border-bottom: 1px solid #1d2742; }
    .hero a { color: var(--accent); }
    .hero-canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; display: block; }
    .aurora { position: absolute; inset: -20%; z-index: -2; filter: blur(70px); opacity: .55; pointer-events: none; }
    .aurora i { position: absolute; width: 46vw; height: 46vw; max-width: 720px; max-height: 720px; border-radius: 50%;
                mix-blend-mode: screen; animation: drift 22s ease-in-out infinite alternate; }
    .aurora i:nth-child(1) { background: #1fb68f; left: 2%; top: 4%; }
    .aurora i:nth-child(2) { background: #4b5dff; right: 0; top: -8%; animation-duration: 28s; animation-delay: -6s; }
    .aurora i:nth-child(3) { background: #b14bff; left: 34%; bottom: -14%; animation-duration: 34s; animation-delay: -12s; opacity: .7; }
    @keyframes drift { 0% { transform: translate(0, 0) scale(1); } 50% { transform: translate(6vw, 4vw) scale(1.15); }
                       100% { transform: translate(-4vw, 6vw) scale(.92); } }
    .hero::after { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
                   background-image: linear-gradient(rgba(140,170,255,.07) 1px, transparent 1px),
                                     linear-gradient(90deg, rgba(140,170,255,.07) 1px, transparent 1px);
                   background-size: 44px 44px;
                   -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 75%);
                           mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 75%); }
    .hero h1 { font-size: clamp(2.3rem, 6.4vw, 4.6rem); max-width: 18ch; }
    .grad { background: linear-gradient(100deg, #7fe3c6 0%, #8ea2ff 30%, #e39bff 55%, #7fe3c6 80%);
            background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
            animation: sheen 9s linear infinite; }
    @keyframes sheen { to { background-position: -220% 0; } }
    .ticker { margin: 0 0 18px; font-size: clamp(1rem, 1.8vw, 1.2rem); color: var(--muted); }
    .ticker b { display: inline-block; color: var(--ink); font-weight: 750;
                border-bottom: 2px solid var(--accent); transition: opacity .35s, transform .35s; }
    @media (min-width: 720px) { .ticker b { min-width: 6ch; } }
    .ticker b.out { opacity: 0; transform: translateY(-.4em); }
    .hero .stats { background: rgba(14, 20, 38, .6); border-color: var(--line);
                   -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
    .hero .stats div { border-color: var(--line); }
    .hero .stats dd a { color: var(--ink); }
    .hero .search input { background: rgba(10, 16, 32, .75); border-color: rgba(148,170,210,.35);
                          box-shadow: 0 0 0 0 rgba(127,227,198,0); transition: box-shadow .25s, border-color .25s; }
    .hero .search input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(127,227,198,.18), 0 10px 40px rgba(75,93,255,.25); outline: none; }
    .hero .search button { box-shadow: 0 6px 24px rgba(127,227,198,.25); }

    /* The moving shelf. Without motion it is a row you can scroll sideways. */
    .marquee { margin: 0; padding: 18px 0; overflow: hidden; display: grid; gap: 10px;
               border-bottom: 1px solid var(--line); background: var(--panel);
               -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
                       mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
    .marquee-row { display: flex; width: max-content; }
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
      .aurora i, .grad, .marquee-row { animation: none; }
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
        const colours = ['127,227,198', '142,162,255', '227,155,255'];
        let w = 0, h = 0, dpr = 1, points = [], running = false, visible = true, frame = 0;
        const pointer = { x: -9999, y: -9999 };
        const size = () => {
          const box = canvas.getBoundingClientRect();
          dpr = Math.min(window.devicePixelRatio || 1, 2);
          w = box.width; h = box.height;
          canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const count = Math.min(110, Math.round((w * h) / 9000));
          points = Array.from({ length: count }, (_, i) => ({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
            r: Math.random() * 1.6 + .6, c: colours[i % colours.length],
          }));
        };
        const draw = () => {
          ctx.clearRect(0, 0, w, h);
          const reach = 130;
          for (const p of points) {
            const dx = pointer.x - p.x, dy = pointer.y - p.y, d = Math.hypot(dx, dy);
            if (d < 200 && d > 1) { p.vx += dx / d * .012; p.vy += dy / d * .012; }
            p.vx *= .992; p.vy *= .992;
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > w) p.vx *= -1;
            if (p.y < 0 || p.y > h) p.vy *= -1;
          }
          for (let i = 0; i < points.length; i++) {
            const a = points[i];
            for (let j = i + 1; j < points.length; j++) {
              const b = points[j], d = Math.hypot(a.x - b.x, a.y - b.y);
              if (d < reach) {
                ctx.strokeStyle = 'rgba(' + a.c + ',' + (0.22 * (1 - d / reach)).toFixed(3) + ')';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
              }
            }
          }
          for (const p of points) {
            ctx.fillStyle = 'rgba(' + p.c + ',.9)';
            ctx.shadowColor = 'rgba(' + p.c + ',.9)'; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          }
          ctx.shadowBlur = 0;
        };
        const loop = () => { if (!running) return; draw(); frame = requestAnimationFrame(loop); };
        const update = () => {
          const should = !still && visible && !document.hidden;
          if (should && !running) { running = true; frame = requestAnimationFrame(loop); }
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
            el.textContent = String(Math.round(target * eased));
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
      document.addEventListener('pointermove', (e) => {
        const card = e.target.closest && e.target.closest('.cat, .pillar, .featured li, .step');
        if (!card) return;
        const box = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - box.left) + 'px');
        card.style.setProperty('--my', (e.clientY - box.top) + 'px');
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
