/**
 * The hardware page (`hardware/`): the portfolio's open hardware designs
 * presented as future products for the businesses that would use them.
 *
 * Owner, 2026-11-24: "the open hardware becomes long term goals for real
 * hardware companies run entirely in an automated way outsourcing what is
 * needed to be done physically such as supply chain etc."
 *
 * Honesty is the point of this page, and a hard limit (`prompts/goals.md`,
 * "Guardrails"): nothing here has been physically built. Every design is CAD
 * and simulation. Nothing is for sale, so the page carries no price, no ship
 * date and no pre-order. Each entry's stage is quoted from its venture's
 * README, and `hardware-page.test.mjs` re-reads those READMEs so the page
 * fails its test the day a README's status line changes and this one does not.
 *
 * The only call to action is "tell us if your business would use this",
 * which is the site's existing feedback form (`feedback/?type=idea&tool=…`),
 * so no new service, form or data store is added.
 *
 * `build.mjs` passes in what lives there (the shared disclaimer footer and the
 * chrome script that carries the usage counter), so this module imports
 * nothing from `build.mjs` and the two never import each other.
 */
import { renderSiteHeader, renderSiteFooterNav, siteStyleLink, siteTitle, REPO_URL, SITE_NAME } from './site-nav.mjs';

/** Where the page is served, relative to the site root. */
export const HARDWARE_PATH = 'hardware/';

/** The feedback page, relative to the site root (`build.mjs`, `FEEDBACK_PATH`). */
const FEEDBACK_PATH = 'feedback/';

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The designs, in the order a business reader meets them. Every `stage` line
 * is checked against `source` (a repository path) by the test: `evidence` is
 * a phrase that must still appear there, case-insensitive.
 *
 * `page` is the design's live tool on this site (relative to the root), or
 * null. `tool` is what the feedback form records the interest against.
 */
export const HARDWARE = Object.freeze([
  {
    id: 'tennis',
    name: 'Tennis ball collection robots',
    who: 'Tennis clubs, academies and coaches',
    what: 'A small rover that roams the court picking up balls while a coach or a ball machine keeps feeding, staying out of keep-out zones around the player and the feeder. A companion design is a ball machine whose 3 m catch net slides to where the return lands, so caught balls go straight back into the hopper.',
    why: 'Collecting balls is court time nobody is paid to coach. A club pays a coach for the hour whether the hour is spent hitting or bending over.',
    stage: 'Design and simulation only. The collector is design v0.2 with a complete fabrication package (laser-cut parts, printed parts, bill of materials and a 14-step assembly guide generated from the CAD); the feeder is a v0.1 design. No robot has been built yet.',
    evidence: 'No robot has been built yet',
    source: 'ventures/open-tennis-robots/README.md',
    repo: 'ventures/open-tennis-robots',
    page: 'open-tennis-robots/',
    tool: 'open-tennis-robots',
    licence: 'FSL-1.1-MIT (MIT two years after each release)',
  },
  {
    id: 'floor',
    name: 'Floor-cleaning robots',
    who: 'Cleaning companies, small offices and short-term rental hosts',
    what: 'One 330 mm round chassis (drive, battery, lidar, cliff sensors, electronics) with a swappable rear module: a vacuum, a mop, or a vacuum-mop combo. A browser simulator shows what each one reaches in a room you lay out.',
    why: 'Routine floor passes between deep cleans are the part of a cleaning job a machine can take, if the machine can be repaired and changed by the business that owns it.',
    stage: 'Design v0.1, tested in CAD and simulation. No robot has been built yet, and lidar mapping and scan matching are not written yet. It is sized like a home robot; a larger commercial version is not designed.',
    evidence: 'no robot has been built yet',
    source: 'ventures/open-floor-robots/README.md',
    repo: 'ventures/open-floor-robots',
    page: 'open-floor-robots/',
    tool: 'open-floor-robots',
    licence: 'FSL-1.1-MIT (MIT two years after each release)',
  },
  {
    id: 'mower',
    name: 'Robot mower for grounds crews',
    who: 'Landscaping companies, grounds crews and facilities teams',
    what: 'A wire-free robot mower that navigates by RTK GNSS, so no boundary wire is buried. A guarded 200 mm blade disc cuts a 232 mm swath; a floating shell stops the blade when it is lifted or bumped, and safety firmware runs the blade only while every safety input is clear. It docks itself to charge.',
    why: 'Routine mowing of the same grounds every week is the work a crew can hand to a machine and move on to edging, planting and repairs.',
    stage: 'Design v0.1, unbuilt, simulation-tested. The CAD passes its collision, clearance and fit checks, and the planner and firmware logic are unit-tested. No mower has been built yet, and every performance number in its README is a model. Its 232 mm swath is lawn-sized; a wider deck for large grounds is not designed.',
    evidence: 'No mower has been built yet',
    source: 'ventures/open-robot-mower/README.md',
    repo: 'ventures/open-robot-mower',
    page: 'open-robot-mower/',
    tool: 'open-robot-mower',
    licence: 'FSL-1.1-MIT (MIT two years after each release)',
  },
  {
    id: 'house',
    name: 'Open house plans',
    who: 'Small builders, designers and owner-builders',
    what: 'Describe a home in a sentence and get a starting plan set: floor plan, elevations, a 3D view, a CAD file (DXF), a BIM model (IFC4), wall framing elevations, a lumber order, a bill of materials and a cost estimate by stage.',
    why: 'A builder pricing a small house or an addition starts from a sketch and a takeoff. This hands over both, as files their own tools open.',
    stage: 'The generator works in a browser today. Its plans are made by software and have not been reviewed by a licensed architect or engineer or checked against any building code: they are not for construction without a licensed review and a permit.',
    evidence: 'Not for construction',
    source: 'ventures/open-house-plans/README.md',
    repo: 'ventures/open-house-plans',
    page: 'open-house-plans/',
    tool: 'open-house-plans',
    licence: 'FSL-1.1-MIT (the software); each generated plan is public domain (CC0)',
  },
  {
    id: 'construction',
    name: 'Construction robotics research',
    who: 'Framing crews, panel plants and construction-robot builders',
    what: 'An open research programme on robots on the residential building site. Its current question: can a robot hang and nail wall sheathing so every nail lands on the stud, at a lower cost per sheet than a crew, and which error source decides it?',
    why: 'Fastening is the largest share of a framing crew’s hours in the programme’s own task book. Knowing what a robot must sense and hold to do it is what decides which machine is worth building.',
    stage: 'Research, not a product. Simulation and analysis only; nothing has been tested on hardware. It is aimed at a peer-reviewed paper.',
    evidence: 'nothing tested on hardware',
    source: 'research/buildbot-sheathing/README.md',
    repo: 'research/buildbot-sheathing',
    page: null,
    tool: 'research',
    licence: 'MIT',
  },
]);

/** The feedback link that records interest in one design, from a page `toRoot` deep. */
export function interestHref(toRoot, item) {
  return `${toRoot}${FEEDBACK_PATH}?type=idea&tool=${encodeURIComponent(item.tool).replace(/%2F/g, '/')}`;
}

const HARDWARE_STYLE = `
    :root {
      color-scheme: light dark;
      --bg: #eef2f7; --panel: #ffffff; --ink: #1d2530; --muted: #4a5666;
      --line: #d3dce6; --accent: #1f4e8c; --soft: #656e78; --flag: #fff4d6; --flag-ink: #5a4300;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #10151c; --panel: #171e27; --ink: #e8eef5; --muted: #a2b0c0;
              --line: #2a343f; --accent: #9dbfe8; --soft: #8d9aab; --flag: #2e2610; --flag-ink: #f2d98a; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 26px 16px 60px; }
    .hw-hero { max-width: 760px; margin: 0 0 22px; }
    .hw-hero .eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: .78rem; color: var(--soft); margin: 0 0 6px; }
    .hw-hero h1 { font-size: clamp(1.7rem, 4.4vw, 2.4rem); letter-spacing: -.02em; margin: 0 0 10px; line-height: 1.15; }
    .hw-hero .lede { color: var(--muted); line-height: 1.6; margin: 0 0 14px; font-size: 1.05rem; }
    .hw-flag { background: var(--flag); color: var(--flag-ink); border-radius: 11px; padding: 12px 16px;
               line-height: 1.55; margin: 0 0 26px; max-width: 760px; }
    .hw-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 16px; margin: 0 0 28px; }
    .hw-card { background: var(--panel); border: 1px solid var(--line); border-radius: 13px; padding: 18px 20px;
               display: flex; flex-direction: column; min-width: 0; }
    .hw-card h2 { font-size: 1.2rem; letter-spacing: -.01em; margin: 0 0 4px; }
    .hw-card .who { color: var(--soft); font-size: .9rem; margin: 0 0 12px; }
    .hw-card p { color: var(--muted); line-height: 1.58; margin: 0 0 10px; }
    .hw-card dl { margin: 4px 0 14px; font-size: .93rem; }
    .hw-card dt { font-weight: 600; color: var(--ink); margin: 8px 0 2px; }
    .hw-card dd { margin: 0; color: var(--muted); line-height: 1.55; }
    .hw-card .stage { border-left: 3px solid var(--accent); padding-left: 10px; }
    .hw-card .links { margin-top: auto; display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: .95rem; }
    .hw-card a, .prose a { color: var(--accent); }
    .hw-card .interest { font-weight: 600; }
    .prose { max-width: 720px; }
    .prose h2 { font-size: 1.25rem; letter-spacing: -.02em; margin: 34px 0 12px; }
    .prose p, .prose ul { color: var(--muted); line-height: 1.62; margin: 0 0 14px; }
    .prose ul { padding-left: 22px; }
    .prose li { margin-bottom: 7px; }
    .prose strong { color: var(--ink); }
`;

function renderCard(item, toRoot) {
  const links = [
    `<a class="interest" href="${esc(interestHref(toRoot, item))}">Tell us if your business would use this</a>`,
    item.page ? `<a href="${esc(`${toRoot}${item.page}`)}">Try the design tools</a>` : '',
    `<a href="${esc(`${REPO_URL}/tree/main/${item.repo}`)}">Open design files</a>`,
  ].filter(Boolean).join('\n          ');
  return `
      <article class="hw-card" id="${esc(item.id)}">
        <h2>${esc(item.name)}</h2>
        <p class="who">For: ${esc(item.who)}</p>
        <p>${esc(item.what)}</p>
        <dl>
          <dt>Why a business would want it</dt>
          <dd>${esc(item.why)}</dd>
          <dt>Honest stage</dt>
          <dd class="stage">${esc(item.stage)}</dd>
          <dt>Licence</dt>
          <dd>${esc(item.licence)}. Anyone may build and change it; selling it as a product waits until that version turns MIT.</dd>
        </dl>
        <p class="links">
          ${links}
        </p>
      </article>`;
}

/**
 * The page.
 *
 * @param {object} o
 * @param {string} o.baseUrl     the site's absolute root, ending in '/'
 * @param {string} [o.footerHtml] the shared disclaimer footer (`disclaimerHtml('../', surfaces)`)
 * @param {string} [o.chromeScript] the chrome `<script>` tag that loads the usage counter
 * @param {string} [o.socialCard] absolute URL of the share card image
 */
export function renderHardwarePage({ baseUrl, footerHtml = '', chromeScript = '', socialCard = '' }) {
  const toRoot = '../';
  const url = `${baseUrl}${HARDWARE_PATH}`;
  const title = 'Open hardware designs for businesses';
  const description = 'Source-available (FSL-1.1-MIT) robot designs for tennis clubs, cleaners and grounds crews, plus house plans for builders. CAD and simulation only: nothing built or for sale yet.';
  const generalInterest = `${toRoot}${FEEDBACK_PATH}?type=idea&tool=hardware`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(siteTitle(title))}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <link rel="icon" href="${esc(`${toRoot}favicon.svg`)}" type="image/svg+xml">
  <link rel="alternate icon" href="${esc(`${toRoot}favicon.ico`)}" sizes="16x16">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:site_name" content="${esc(SITE_NAME)}">${socialCard ? `
  <meta property="og:image" content="${esc(socialCard)}">
  <meta name="twitter:card" content="summary_large_image">` : ''}
  <style>${HARDWARE_STYLE}  </style>
  ${siteStyleLink(toRoot)}
</head>
<body>
  ${renderSiteHeader({ toRoot, crumbs: [{ label: 'Hardware', echo: false }] })}
  <div class="wrap">
    <header class="hw-hero">
      <p class="eyebrow">Hardware</p>
      <h1>${esc(title)}</h1>
      <p class="lede">Machines for the repetitive physical work in a small business: collecting tennis balls, cleaning floors, mowing grounds, and the plans and robots behind building a house. Each is designed in the open, in code, and published under the MIT licence.</p>
    </header>

    <p class="hw-flag" role="note"><strong>Nothing here has been built yet.</strong>
    Every design is CAD and simulation; every performance figure in them is a model.
    None of these is for sale, and there is no price, ship date or pre-order. If your business
    would use one, telling us is what decides which gets built first.</p>

    <section class="hw-list" aria-label="The designs">${HARDWARE.map((item) => renderCard(item, toRoot)).join('')}
    </section>

    <main class="prose">
      <h2>Where this is going</h2>
      <p>The long-term aim is to turn these designs into real hardware products for the
      businesses above, made by companies that run almost entirely in software: design,
      testing, ordering and support done by agents, and the physical work (machining,
      assembly, shipping, the supply chain) contracted out to manufacturers and logistics firms.
      That is a goal, not something that exists today.</p>
      <p>Before any of it is sold, a design has to be built, tested on real courts, floors and
      lawns, and meet the safety and compliance rules for where it is sold. Until then,
      the designs stay free and open, and the stage on each card says exactly how far it has got.</p>

      <h2>Tell us what you would use</h2>
      <p>The interest links on each card open this site's <a href="${esc(`${toRoot}${FEEDBACK_PATH}`)}">feedback form</a>
      with the design already named. No account is needed. Say what your business does and what the
      machine would have to do for you. Messages are published in the site's public repository with
      email addresses removed, so leave out anything private.</p>
      <ul>
        <li><a href="${esc(generalInterest)}">Suggest a machine for your business</a> that is not on this page.</li>
        <li><a href="${esc(`${REPO_URL}/tree/main/ventures`)}">Browse every design's source</a>: CAD in code, firmware, simulations and tests.</li>
      </ul>
      <p>Anyone may build and change these designs under their licence (FSL-1.1-MIT), and sell
      what they build once that version has turned MIT, two years after its release. Whoever builds
      or sells one is its manufacturer and is responsible for its safety and compliance; the designs
      come with no warranty.</p>
    </main>

    <footer>${footerHtml}
      ${renderSiteFooterNav({ toRoot })}
    </footer>
  </div>
  ${chromeScript}
</body>
</html>
`;
}
