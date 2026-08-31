// Link-contrast gate for the portfolio's own venture pages, with no browser.
//
// WHY THIS EXISTS
//
// `contrast.mjs` is the real measurement: it renders all 477 built pages at two
// viewports and runs axe-core over them. It is also unrunnable in CI here — it
// needs Playwright and axe-core, neither of which is a dependency of this repo.
// So nothing gated the shipped pages, and on 2026-08-30 a full browser run
// turned up 20 serious WCAG 1.4.3 violations across four of them that had been
// live in `main` the whole time. All 20 were on links:
//
//   * three article pages whose accent link colour sat at 4.09–4.49:1 against
//     the page — just under the 4.5:1 that normal-size text needs;
//   * on one of those, a `footer{opacity:.85}` faded the same link further, to
//     3.31:1, while the identical link elsewhere on the page measured 4.20:1;
//   * and one calculator whose article link sits inside a dark `header` that no
//     rule gives a link colour, so the browser default `#0000ee` rendered on
//     `#123c3a` at 1.28:1. Effectively invisible.
//
// WHY ONLY LINKS
//
// Without a DOM there is no way to know which box a bare class sits in. On
// these pages `.positive{color:#a9e8b5}` reads as a 1.16:1 failure against the
// page background and is in fact fine, because it only ever appears inside a
// dark `.result` panel — containment the HTML knows and the stylesheet does
// not. A first cut of this file decided those anyway and produced 510 findings
// against axe's zero. An engine that guesses is worse than one that declines,
// so it now decides only the element whose colour is routinely set independent
// of its container, and which carries every violation actually found: `<a>`.
//
// Everything else on the page is OUT OF SCOPE here and is counted as such, not
// reported clean. `portfolio/research/a11y-delivered-contrast/` exists because
// of exactly that confusion: an engine handed no stylesheet decided nothing,
// emitted no 1.4.3 finding, and was byte-identical in its output to a page that
// had been checked and passed.
//
//   node platform/pages/ink.mjs            # report
//   node platform/pages/ink.mjs --strict   # non-zero exit on a violation
//
// Run `contrast.mjs` against a build before believing a clean result here is
// the whole story. This is the floor, not the ceiling.

import { readdirSync, readFileSync, statSync } from 'node:fs';
// `resolve` is aliased: this module already has a CSS-variable resolver of
// that name below, and the two would collide.
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

// `ventures/` relative to *this file*, not to the process's working directory.
//
// The default used to be the bare string 'ventures', which resolves against
// cwd — so `auditVentures()` found the tree when the suite was run from the
// repository root and threw ENOENT when it was run from `platform/pages`.
// That second spelling is the one `portfolio-pages.yml` uses
// (`working-directory: platform/pages`), so the audit has been failing in the
// workflow that publishes the site while passing for anyone who ran it by hand
// from the root.
const VENTURES_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ventures');

/** WCAG 2.1 minimum for normal-size text (1.4.3 Contrast (Minimum), level AA). */
export const AA_NORMAL = 4.5;

/** The colour a browser paints an unvisited `<a href>` that no rule reaches. */
export const UA_LINK = '#0000ee';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` and `#aabbcc` to `[r, g, b]`. Throws on anything else. */
export function parseHex(value) {
  let h = String(value).trim().toLowerCase();
  if (!HEX.test(h)) throw new Error(`not a hex colour: ${value}`);
  h = h.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** WCAG relative luminance. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours, 1..21. Order does not matter. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(parseHex(a)), luminance(parseHex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Composite `fg` over `bg` at `alpha`.
 *
 * A parent's `opacity` is not inherited as a property — it composites the whole
 * subtree — but for text on a flat background the visible result is the same
 * blend, and that is the case this models.
 */
export function blend(fg, bg, alpha) {
  const f = parseHex(fg);
  const b = parseHex(bg);
  const hex = f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0'));
  return `#${hex.join('')}`;
}

/** Pull the contents of every `<style>` block out of an HTML document. */
function stylesheets(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
}

/**
 * Flatten a stylesheet into `{selector, decls}` records.
 *
 * `@media print` is dropped: those rules paint onto paper, not onto the page
 * background, so judging them against it is meaningless. Screen media queries
 * are hoisted rather than skipped — a phone-only override is still a colour
 * that ships, which is why `contrast.mjs` checks both viewports.
 */
export function rules(css) {
  const flat = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@media[^{]*\bprint\b[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, '')
    .replace(/@media[^{]*\{/gi, '')
    .replace(/\}\s*\}/g, '}');
  const out = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      decls[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
    }
    for (const selector of m[1].split(',')) {
      const s = selector.trim();
      if (s) out.push({ selector: s, decls });
    }
  }
  return out;
}

/**
 * Resolve `var(--name)` against the custom properties this document declares.
 *
 * One level deep, which is all these pages use. A value that still is not a hex
 * colour after this comes back null and the caller declines it.
 */
function resolve(value, vars) {
  if (!value) return null;
  let v = value.trim();
  const m = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (m) v = (vars[m[1]] ?? '').trim();
  return HEX.test(v) ? v.toLowerCase() : null;
}

/** The element or class a selector ends on: `header a` -> `a`, `.cta` -> `.cta`. */
function subject(selector) {
  return selector.trim().split(/\s+/).pop().split(':')[0];
}

/** Does the document put an `<a href>` inside this element? */
function elementHoldsLink(html, element) {
  const block = new RegExp(`<${element}\\b[^>]*>([\\s\\S]*?)</${element}>`, 'i').exec(html);
  return Boolean(block && /<a\s[^>]*href=/i.test(block[1]));
}

/**
 * Audit the link colours of one HTML document.
 *
 * Returns `{decided, declined, outOfScope, findings}`. A finding is a link
 * colour/background pair this could resolve exactly and that falls under 4.5:1.
 */
export function auditHtml(html, label = '') {
  const findings = [];
  const declined = [];
  let decided = 0;
  let outOfScope = 0;

  const css = stylesheets(html).join('\n');
  if (!css.trim()) {
    return { decided, declined: [{ label, why: 'no inline stylesheet to read' }], outOfScope, findings };
  }

  const all = rules(css);

  // Custom properties, and the page background every unqualified rule sits on.
  const vars = {};
  let pageBg = null;
  for (const { selector, decls } of all) {
    for (const [prop, value] of Object.entries(decls)) {
      if (prop.startsWith('--')) vars[prop] ??= value;
    }
    if (![':root', 'html', 'body'].includes(selector)) continue;
    const bg = resolve(decls.background ?? decls['background-color'], vars);
    if (bg) pageBg = bg;
  }
  if (!pageBg) {
    return { decided, declined: [{ label, why: 'no resolvable page background' }], outOfScope, findings };
  }

  // Backgrounds and opacities that a simple rule paints over its subtree, so a
  // descendant selector can be judged against the box it names. Only simple
  // selectors — one element or one class, no combinators — and only ever
  // consulted when that name appears as an ancestor in the selector being
  // judged, which is what keeps this from guessing where a bare class sits.
  //
  // Declaration order is the cascade here: these are single-specificity rules
  // in one stylesheet, so a later rule wins. `opacity` in particular must be
  // able to go back UP — `.note, footer{opacity:.86}` followed by
  // `footer{opacity:1}` leaves the footer fully opaque, and reading only the
  // first of the two invents a fade the browser never applies.
  const boxBg = new Map();
  const boxAlpha = new Map();
  const isSimple = (s) => /^(?:[a-z][a-z0-9]*|\.[\w-]+)$/i.test(s);
  for (const { selector, decls } of all) {
    if (!isSimple(selector) || ['body', 'html'].includes(selector)) continue;
    const bg = resolve(decls.background ?? decls['background-color'], vars);
    if (bg) boxBg.set(selector, bg);
    if (decls.opacity !== undefined) {
      const a = parseFloat(decls.opacity);
      if (Number.isFinite(a) && a < 1) boxAlpha.set(selector, a);
      else boxAlpha.delete(selector);
    }
  }

  const record = (selector, fg, bg, alpha, note) => {
    const effective = alpha < 1 ? blend(fg, bg, alpha) : fg;
    const ratio = contrast(effective, bg);
    decided += 1;
    if (ratio < AA_NORMAL) {
      findings.push({
        label, selector, color: fg, background: bg,
        ratio: Number(ratio.toFixed(2)),
        ...(alpha < 1 ? { opacity: alpha, effective } : {}),
        ...(note ? { note } : {}),
      });
    }
  };

  // 1. Rules that colour link text. `a{...}` applies page-wide, so the page
  //    background is the right reference; `footer a{...}` is judged against
  //    `footer`'s own background when it declares one.
  const linkRules = all.filter((r) => r.decls.color && subject(r.selector) === 'a');
  for (const { selector, decls } of linkRules) {
    const fg = resolve(decls.color, vars);
    if (!fg) {
      if (decls.color.trim() !== 'inherit') {
        declined.push({ label, selector, why: `unresolvable colour: ${decls.color}` });
      }
      continue;
    }
    const parts = selector.trim().split(/\s+/);
    let bg = resolve(decls.background ?? decls['background-color'], vars);
    let alpha = 1;
    for (const part of parts.slice(0, -1)) {
      if (!bg && boxBg.has(part)) bg = boxBg.get(part);
      if (boxAlpha.has(part)) alpha = boxAlpha.get(part);
    }
    record(selector, fg, bg ?? pageBg, alpha);
  }

  // 2. A page-wide link colour, faded by a container that sets `opacity` and
  //    holds links. This is the medical-courier footer: the same `a{color}`
  //    that clears 4.5:1 on the page is composited to 3.31:1 inside it.
  const pageLink = linkRules.find((r) => r.selector === 'a');
  const pageLinkColor = pageLink && resolve(pageLink.decls.color, vars);
  if (pageLinkColor) {
    for (const [element, alpha] of boxAlpha) {
      if (linkRules.some((r) => r.selector === `${element} a`)) continue;   // overridden
      if (!elementHoldsLink(html, element)) continue;
      record(`${element} a`, pageLinkColor, boxBg.get(element) ?? pageBg, alpha,
        `faded by ${element}{opacity:${alpha}}, which composites its whole subtree`);
    }
  }

  // 3. Links a container paints a background behind but gives no colour, which
  //    a browser then paints its own default blue. Counted only when the
  //    document really does put a link in that container.
  const styledScopes = new Set(linkRules.map((r) => r.selector.trim().split(/\s+/).slice(0, -1).join(' ')));
  if (!styledScopes.has('')) {                       // a bare `a{color}` covers them all
    for (const [element, bg] of boxBg) {
      if (styledScopes.has(element) || !elementHoldsLink(html, element)) continue;
      record(`${element} a`, UA_LINK, bg, 1,
        'no rule gives this link a colour, so the browser default applies');
    }
  }

  // Everything that is not link text. Reported as a number so a clean run can
  // never be read as "the whole page was checked".
  outOfScope = all.filter((r) => r.decls.color && subject(r.selector) !== 'a').length;

  return { decided, declined, outOfScope, findings };
}

/** Every `.html` file directly inside each venture directory. */
function venturePages(root) {
  const pages = [];
  for (const slug of readdirSync(root).sort()) {
    const dir = join(root, slug);
    let entries;
    try {
      if (!statSync(dir).isDirectory()) continue;
      entries = readdirSync(dir);
    } catch { continue; }
    for (const file of entries.filter((f) => f.endsWith('.html')).sort()) {
      pages.push({ slug, file, path: join(dir, file) });
    }
  }
  return pages;
}

export function auditVentures(root = VENTURES_ROOT) {
  const findings = [];
  const declined = [];
  let decided = 0;
  let outOfScope = 0;
  const pages = venturePages(root);
  for (const page of pages) {
    const r = auditHtml(readFileSync(page.path, 'utf8'), `${page.slug}/${page.file}`);
    decided += r.decided;
    outOfScope += r.outOfScope;
    declined.push(...r.declined);
    findings.push(...r.findings);
  }
  return { pages: pages.length, decided, declined, outOfScope, findings };
}

const invoked = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invoked) {
  const strict = process.argv.includes('--strict');
  const { pages, decided, declined, outOfScope, findings } = auditVentures();

  for (const f of findings) {
    console.log(`FAIL  ${f.label}`);
    console.log(`      ${f.selector}: ${f.color} on ${f.background}`
      + `${f.opacity ? ` faded to ${f.effective}` : ''} = ${f.ratio}:1, needs ${AA_NORMAL}:1`);
    if (f.note) console.log(`      ${f.note}`);
  }
  for (const d of declined) {
    console.log(`SKIP  ${d.label}${d.selector ? ` (${d.selector})` : ''}: ${d.why}`);
  }

  const summary = `${pages} page(s), ${decided} link colour(s) decided, ${declined.length} declined, `
    + `${outOfScope} non-link colour(s) out of scope`;
  console.log(findings.length
    ? `\n${findings.length} link contrast violation(s). ${summary}.`
    : `\nNo link contrast violation. ${summary}.`);
  console.log('Link text only — run contrast.mjs over a build for the rest of the page.');

  if (strict && findings.length) process.exit(1);
}
