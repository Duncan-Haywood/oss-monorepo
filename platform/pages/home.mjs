// The home page's sections below the hero: how the site works, who it is for,
// the category tiles with their icons, the research band and the latest
// writing, plus the structured data that tells a search engine what the site
// is and how to search it.
//
// Kept beside `showcase.mjs` (the hero, the shelf and the recording) and out of
// build.mjs, so the front door's look can change without touching the hub's
// search, counting and saved-bid code. Everything here is static markup and
// inline SVG: no image is fetched, nothing needs JavaScript to read or click.

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 24px line icons, drawn here by hand in one style (2px round strokes on a
// 24 grid), one per section of the catalogue. `currentColor`, so each tile
// tints its icon with its own section's accent.
const ICON_PATHS = {
  'self-hosted': '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>',
  marketplace: '<path d="M5 8h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  trades: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  'food-service': '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5a2 2 0 0 0 2 2M9 3v5a2 2 0 0 1-2 2"/><path d="M17 21V3c-2 1.5-3 4-3 7v3h3"/>',
  services: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m9 15 2 2 4-4"/>',
  logistics: '<path d="M2 7h11v9H2zM13 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  evidence: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  'uk-tax': '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M14.5 11.5A2.3 2.3 0 0 0 10.4 13v4M9 17h6M9 14.5h4"/>',
  backoffice: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  ci: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8M18 11c0 4-6 3-11 6"/>',
  'solo-earner': '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  'research-algorithms': '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 15h9"/>',
  learning: '<path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
  apps: '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/><path d="M12 12v6M9.5 14.5 12 12l2.5 2.5"/>',
  cli: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  more: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  // The "how it works" and "also here" glyphs.
  browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/><path d="m10 13 2 2 3-3"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  deploy: '<path d="M12 3c3 2 5 5.5 5 9.5L15 16H9l-2-3.5C7 8.5 9 5 12 3z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1M15 16l2 4-3-1"/>',
  guide: '<path d="M4 5a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 2h12v-4M8 7h6M8 11h6"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
};

/**
 * A tool's name as a card shows it: the part before a search-result tagline
 * ("— free, private, in your browser"), without a trailing "Free, private".
 */
export function cardName(title) {
  const raw = String(title ?? '').replace(/\s+/g, ' ').trim();
  const primary = raw.split(/\s+[—–|]\s+/)[0].trim() || raw;
  return primary.replace(/[\s.,:;]*(?:free,?\s+(?:and\s+)?private(?:\s+calculator)?|free)\.?$/i, '').trim() || primary;
}

/** One of the hand-drawn line icons as inline SVG, decorative. */
export function icon(name, { size = 24, className = 'ico' } = {}) {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.more;
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

export const ICON_NAMES = Object.keys(ICON_PATHS);

/** The three steps a visitor needs to know before anything else. */
export function renderHowItWorks({ toolCount = 0, appCount = 0 } = {}) {
  const steps = [
    {
      glyph: 'browser',
      title: 'Open a tool and type your numbers',
      body: `${toolCount ? `${toolCount} tools` : 'Every tool'} run entirely in your browser. No account, no upload: the arithmetic happens on your device, and works offline once opened.`,
    },
    {
      glyph: 'code',
      title: 'Check how the answer is worked out',
      body: 'Every formula, test and research result is open source under the MIT licence, so you can read exactly how a number was reached.',
    },
    {
      glyph: 'deploy',
      title: 'Run your own copy',
      body: `${appCount ? `${appCount} self-hostable apps` : 'The apps'} deploy into your own cloud account with your own keys. Nothing of ours sits in between.`,
      href: 'deploy/',
      cta: 'Deploy your own',
    },
  ];
  return `    <section class="band how" id="how" aria-labelledby="how-h">
      <p class="section-eyebrow">How it works</p>
      <h2 id="how-h">Free tools you can use, check and own</h2>
      <ol class="steps">
${steps
  .map(
    (s, i) => `        <li class="step">
          <span class="step-ico">${icon(s.glyph)}<b>${i + 1}</b></span>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.body)}${s.href ? ` <a href="${esc(s.href)}">${esc(s.cta)} →</a>` : ''}</p>
        </li>`,
  )
  .join('\n')}
      </ol>
    </section>`;
}

/**
 * A category tile: icon, name, count, what it is for, and a taste of what is
 * in it. `accent` tints the icon, the rule along the top and the hover.
 */
export function renderCategoryCard({ id, href, title, blurb, count, examples = [], note = '', accent = '#12594a' }) {
  return `        <li class="cat" style="--cat:${esc(accent)}">
          <div class="cat-head">
            <span class="cat-ico">${icon(id)}</span>
            <h3><a href="${esc(href)}" data-category="${esc(id)}">${esc(title)}</a></h3>
            <span class="cat-count">${count}</span>
          </div>
          <p class="cat-blurb">${esc(blurb)}</p>
          <ul class="cat-examples">
${examples
  .map((s) => `            <li><a href="${esc(s.slug)}/" data-tool="${esc(s.slug)}">${esc(cardName(s.title))}</a></li>`)
  .join('\n')}
          </ul>
          <a class="cat-all" href="${esc(href)}" aria-label="${esc(`${note || `All ${count} tools`} in ${title}`)}">${esc(note || `All ${count} tools`)} →</a>
        </li>`;
}

// A colour per research theme, in the order the research homepage lists them.
const THEME_COLOURS = ['#7fe3c6', '#8ea2ff', '#e39bff', '#ffc078', '#74c0fc', '#ff8fa3', '#b2f2bb', '#ffd43b'];

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/**
 * A small abstract figure for a research card: a few nodes joined into a
 * graph, placed by a hash of the slug so each card has its own. Decorative
 * and labelled as such; it is not a chart of anything.
 */
export function researchMotif(slug, colour) {
  let h = hash(slug);
  const rand = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return (h % 1000) / 1000; };
  const points = Array.from({ length: 8 }, (_, i) => [8 + (i / 7) * 124 + (rand() - 0.5) * 8, 12 + rand() * 34]);
  const lines = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    lines.push([points[i], points[i + 1]]);
    if (rand() > 0.55 && i + 2 < points.length) lines.push([points[i], points[i + 2]]);
  }
  const f = (n) => n.toFixed(1);
  return `<svg class="motif" viewBox="0 0 140 58" width="140" height="58" aria-hidden="true" focusable="false">${lines
    .map(([a, b]) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${colour}" stroke-opacity=".5" stroke-width="1.3" stroke-linecap="round"/>`)
    .join('')}${points
    .map(([x, y], i) => `<circle cx="${f(x)}" cy="${f(y)}" r="${i % 3 === 0 ? 4.2 : 2.8}" fill="${colour}"${i % 3 === 0 ? ' fill-opacity=".9"' : ''}/>${i % 3 === 0 ? `<circle cx="${f(x)}" cy="${f(y)}" r="8" fill="${colour}" fill-opacity=".14"/>` : ''}`)
    .join('')}</svg>`;
}

/**
 * The research band: dark like the hero, so the page has a rhythm of light
 * and night sections. Featured projects as cards (theme, question, the
 * project's own one-line summary), then every theme as a chip.
 */
export function renderResearchBand({ featured = [], themes = [], projects = [] } = {}, researchCount = 0, { researchPath = 'research/', topicsDir = 'topics' } = {}) {
  if (!researchCount) return '';
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  const themeIndex = new Map(themes.map((t, i) => [t.id, i]));
  const colourFor = (themeId) => THEME_COLOURS[(themeIndex.get(themeId) ?? 0) % THEME_COLOURS.length];
  const cards = featured.slice(0, 6).map((p) => {
    const full = bySlug.get(p.slug) ?? {};
    const colour = colourFor(full.themeId);
    const summary = String(full.summary ?? '').replace(/\s+/g, ' ').trim();
    const short = summary.length > 150 ? `${summary.slice(0, 147).replace(/\s+\S*$/, '')}…` : summary;
    return `        <li class="rcard" style="--theme:${colour}">
          <a href="${esc(`${researchPath}${p.slug}/`)}">
            ${researchMotif(p.slug, colour)}
            ${full.themeName ? `<span class="rtheme">${esc(full.themeName)}</span>` : ''}
            <span class="rtitle">${esc(p.title)}</span>
            ${short ? `<span class="rsum">${esc(short)}</span>` : ''}
          </a>
        </li>`;
  });
  const chips = themes.map((t) => `<a href="${esc(`${researchPath}${topicsDir}/${t.id}/`)}" style="--theme:${colourFor(t.id)}">${esc(t.name)} <span>${t.count}</span></a>`);
  return `    <section class="band night" id="research" aria-labelledby="research-h">
      <p class="section-eyebrow">Open research</p>
      <h2 id="research-h">${researchCount} reproducible research projects</h2>
      <p class="band-lede">Verification markets, scoring rules, decentralised training, chip design, energy and robotics. Each project states its question, ships runnable code and tests, and writes up what it found and where it falls short. <a href="${esc(researchPath)}">Browse all research →</a></p>
${cards.length ? `      <ul class="rcards">\n${cards.join('\n')}\n      </ul>` : ''}
${chips.length ? `      <p class="research-themes">${chips.join(' ')}</p>` : ''}
    </section>`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : String(iso);
};

/** The newest essays, so the front door shows the site is alive. */
export function renderLatestWriting(posts = [], { writingPath = 'writing/', limit = 3 } = {}) {
  const latest = [...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, limit);
  if (!latest.length) return '';
  return `    <section class="band" id="writing" aria-labelledby="writing-h">
      <p class="section-eyebrow">Writing</p>
      <h2 id="writing-h">Notes from building it in public</h2>
      <p class="band-lede">Essays drawn from this repository's own history and numbers. <a href="${esc(writingPath)}">Read all ${posts.length} posts →</a></p>
      <ul class="posts">
${latest
  .map(
    (p) => `        <li><a href="${esc(`${writingPath}${p.slug}/`)}">
          <span class="post-meta">${icon('pen', { size: 16 })}<time datetime="${esc(p.date)}">${esc(longDate(p.date))}</time>${p.minutes ? ` · ${p.minutes} min read` : ''}</span>
          <span class="post-title">${esc(p.title)}</span>
          <span class="post-desc">${esc(p.description)}</span>
        </a></li>`,
  )
  .join('\n')}
      </ul>
    </section>`;
}

/**
 * The site-level structured data a search engine reads to show a sitelinks
 * search box and a knowledge panel: the WebSite with its search action (the
 * hub reads `?q=` on load and runs the search), and the organisation behind
 * it. Kept separate from the hub's CollectionPage, which describes the page.
 */
export function siteStructuredData({ baseUrl, siteName, description, repoUrl, logo, founder }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${baseUrl}#website`,
        url: baseUrl,
        name: siteName,
        description,
        inLanguage: 'en',
        publisher: { '@id': `${baseUrl}#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${baseUrl}?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${baseUrl}#organization`,
        name: siteName,
        url: baseUrl,
        logo: { '@type': 'ImageObject', url: logo, width: 512, height: 512 },
        sameAs: [repoUrl],
        ...(founder ? { founder: { '@type': 'Person', name: founder } } : {}),
      },
    ],
  };
}

export const HOME_SECTIONS_CSS = `
    /* ---- Sections below the hero (home.mjs) --------------------------------- */
    .band { margin-top: 72px; }
    .section-eyebrow { display: inline-flex; align-items: center; gap: 8px; }
    .section-eyebrow::before { content: ""; width: 18px; height: 2px; border-radius: 2px;
                               background: linear-gradient(90deg, #12594a, #3b5bdb); }
    .ico { display: block; }

    /* How it works: three numbered steps joined by a dashed rule. */
    .steps { list-style: none; padding: 0; margin: 26px 0 0; display: grid; gap: 16px;
             grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); counter-reset: step; position: relative; }
    .step { position: relative; padding: 22px 22px 20px; border: 1px solid var(--line); border-radius: 18px;
            background: linear-gradient(180deg, var(--panel), color-mix(in srgb, var(--panel) 92%, var(--hero-2))); }
    .step-ico { position: relative; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px;
                color: #fff; background: linear-gradient(135deg, #12594a, #3b5bdb);
                box-shadow: 0 10px 24px -12px rgba(59, 91, 219, .7); margin-bottom: 14px; }
    .step-ico b { position: absolute; top: -7px; right: -7px; width: 22px; height: 22px; border-radius: 50%;
                  display: grid; place-items: center; font-size: .75rem; background: var(--panel); color: var(--ink);
                  border: 1px solid var(--line); }
    .step h3 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: -.01em; }
    .step p { margin: 0; color: var(--muted); font-size: .92rem; line-height: 1.6; }
    .step a { font-weight: 650; white-space: nowrap; }

    /* Who it is for: chips with a count. */
    .for-list a { transition: border-color .2s, color .2s, transform .2s, box-shadow .2s; }
    .for-list a:hover, .for-list a:focus-visible { transform: translateY(-2px); box-shadow: 0 10px 22px -16px rgba(20, 40, 120, .5); }
    .for-list span { display: inline-block; min-width: 1.6em; margin-left: 4px; padding: 0 6px; border-radius: 999px;
                     background: var(--bg); text-align: center; }

    /* Category tiles. */
    .cat { padding: 20px 20px 16px; overflow: hidden; border-radius: 16px; }
    .cat::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px;
                  background: linear-gradient(90deg, var(--cat), color-mix(in srgb, var(--cat) 30%, #8ea2ff)); }
    .cat:hover { border-color: color-mix(in srgb, var(--cat) 55%, var(--line)); }
    .cat-head { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; margin-bottom: 10px; }
    .cat-head h3 { margin: 0; font-size: 1.05rem; line-height: 1.25; }
    .cat-ico { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px;
               color: var(--cat); background: color-mix(in srgb, var(--cat) 13%, var(--panel));
               border: 1px solid color-mix(in srgb, var(--cat) 22%, transparent); }
    .cat-count { font-size: .78rem; font-weight: 700; color: var(--muted); padding: 3px 9px; border-radius: 999px;
                 border: 1px solid var(--line); background: var(--bg); font-variant-numeric: tabular-nums; }
    .cat-all { color: var(--cat); }
    @media (prefers-color-scheme: dark) {
      .cat { --cat-ink: color-mix(in srgb, var(--cat) 45%, #ffffff); }
      .cat-ico { color: var(--cat-ink); background: color-mix(in srgb, var(--cat) 30%, var(--panel)); }
      .cat-all { color: var(--cat-ink); }
    }

    /* Featured tools: a card grid with the section's colour along the left. */
    .featured li { border-left: 3px solid var(--feat, var(--accent)); }
    .featured p { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    @media (prefers-color-scheme: dark) { .featured li { border-left-color: color-mix(in srgb, var(--feat) 50%, #fff); } }

    /* The research band, dark like the hero, edge to edge without widening
       the page: the shadow paints the bleed and the clip keeps it in view. */
    .band.night { position: relative; margin-top: 80px; padding: 56px 0 60px; color: #eef2f8;
                  --ink: #eef2f8; --muted: #b6c2d3; --soft: #98a5b8; --line: rgba(148, 170, 210, .22);
                  --panel: rgba(20, 28, 48, .72); --accent: #7fe3c6; --bg: #080d1a;
                  background: #080d1a; box-shadow: 0 0 0 100vmax #080d1a; clip-path: inset(0 -100vmax); }
    .band.night::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 0;
                          /* Both glows fade out well inside the band, so its
                             edge never shows against the flat bleed. */
                          background: radial-gradient(closest-side, rgba(31, 182, 143, .16), transparent) 8% -40% / 46% 70% no-repeat,
                                      radial-gradient(closest-side, rgba(75, 93, 255, .2), transparent) 96% 130% / 52% 80% no-repeat; }
    .band.night > * { position: relative; z-index: 1; }
    .band.night a { color: var(--accent); }
    .band.night .section-eyebrow { color: #7fe3c6; }
    .rcards { list-style: none; padding: 0; margin: 26px 0 0; display: grid; gap: 14px;
              grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
    .rcard a { display: flex; flex-direction: column; gap: 8px; height: 100%; padding: 18px 18px 20px; border-radius: 16px;
               border: 1px solid var(--line); background: var(--panel); color: var(--ink); text-decoration: none;
               -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
               transition: transform .25s, border-color .25s, box-shadow .25s; }
    .rcard a:hover, .rcard a:focus-visible { transform: translateY(-4px); border-color: var(--theme);
                                             box-shadow: 0 24px 50px -28px var(--theme); }
    .motif { display: block; width: 140px; height: 58px; margin-bottom: 4px; }
    .rtheme { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--theme); }
    .rtitle { font-weight: 700; font-size: 1.02rem; line-height: 1.35; color: var(--ink); }
    .rsum { font-size: .87rem; line-height: 1.55; color: var(--muted); }
    .band.night .research-themes a { background: rgba(14, 20, 38, .6); color: var(--ink); border-color: var(--line); }
    .band.night .research-themes a::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%;
                                             background: var(--theme); margin-right: 7px; vertical-align: 1px; }
    .band.night .research-themes a:hover { border-color: var(--theme); }

    /* Latest writing. */
    .posts { list-style: none; padding: 0; margin: 22px 0 0; display: grid; gap: 14px;
             grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .posts a { display: flex; flex-direction: column; gap: 8px; height: 100%; padding: 18px 20px; border-radius: 16px;
               border: 1px solid var(--line); background: var(--panel); color: var(--ink); text-decoration: none;
               transition: transform .25s, border-color .25s, box-shadow .25s; }
    .posts a:hover, .posts a:focus-visible { transform: translateY(-3px); border-color: var(--accent);
                                             box-shadow: 0 18px 40px -26px rgba(20, 40, 120, .45); }
    .post-meta { display: flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--muted); }
    .post-meta .ico { color: var(--accent); }
    .post-title { font-weight: 700; font-size: 1.05rem; line-height: 1.35; letter-spacing: -.01em; }
    .post-desc { font-size: .88rem; line-height: 1.55; color: var(--muted); }

    /* "Also here" cards carry an icon too. */
    .pillar-ico { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; margin-bottom: 14px;
                  color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--panel));
                  border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent); }

    @media (prefers-reduced-motion: reduce) {
      .rcard a, .posts a, .for-list a { transition: none; }
      .rcard a:hover, .posts a:hover, .for-list a:hover { transform: none; }
    }
    @media (max-width: 640px) {
      .band { margin-top: 56px; }
      .band.night { padding: 40px 0 44px; }
      .band.night::before { display: none; }
      .rcards, .posts { grid-template-columns: 1fr; }
      /* Thirty trades as a three-row strip that scrolls sideways, rather
         than a screen and a half of chips. */
      .band.night .research-themes { display: grid; grid-auto-flow: column; grid-template-rows: repeat(4, auto);
                                     justify-content: start; overflow-x: auto; padding-bottom: 8px; scrollbar-width: thin; }
      .band.night .research-themes a { white-space: nowrap; }
      .for-list { display: grid; grid-auto-flow: column; grid-template-rows: repeat(3, auto); justify-content: start;
                  overflow-x: auto; padding-bottom: 8px; scroll-snap-type: x proximity; scrollbar-width: thin; }
      .for-list li { scroll-snap-align: start; }
      .for-list a { white-space: nowrap; }
    }`;
