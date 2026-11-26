// The rules behind phone-probe-check.mjs, kept free of Playwright so they can
// be tested without a browser (phone-probe.test.mjs).
//
// Why this exists: five polish runs on 2026-11-26 measured a construction
// front door to the paid pay-app product on a 390 px phone by hand, each
// with its own throwaway Playwright script, and each found the same three
// defect classes (docs/reports/polish-2026-11-26-*.md):
//
//   1. the page itself scrolls sideways (retainage-cashflow-calculator, 581 px
//      in a 390 px window): `sideways.mjs` catches this, but only over a full
//      site build, and only at load;
//   2. a results table hides its answer columns inside a sideways scroller
//      (the retainage rate table, 527 px in a 321 px box; the pay-app
//      results, 1,004 px in 312 px). The page passes `sideways.mjs`, because
//      the scroller contains the overflow, and most phone visitors never
//      swipe a table, so "Bid to keep progress cash" was simply not seen;
//   3. a form field under 16 px, which iOS zooms into on focus
//      (`input-zoom.mjs` now floors these in the shared chrome; this checks
//      the floor still holds on the rendered page);
//
// plus a fourth the cards fix can overshoot: a stacked table row (one card
// per row on a phone) taller than the screen, so a visitor cannot see one
// line item whole.
//
// Results tables usually appear only after the form is worked out, so the
// runner also loads the page's example and submits it (`EXAMPLE_RE`,
// `SUBMIT_RE`) and measures again.

/** A phone screen, CSS px (the width the polish notes measured). */
export const PHONE = { width: 390, height: 844 };

/** Slack for sub-pixel rounding, CSS px. */
export const SLACK_PX = 1;

/** iOS Safari zooms into a focused field below this computed font size. */
export const MIN_FIELD_PX = 16;

/** Buttons that fill a tool's form with its worked example. */
export const EXAMPLE_RE = /\b(load|try|use|fill( in)?|show)\b[^.]{0,20}\b(an? |the )?(example|sample|demo)\b|^\s*(example|sample)( data| job| project)?\s*$/i;

/** Buttons that work a filled form out. */
export const SUBMIT_RE = /^\s*(calculate|work (it )?out|check|generate|compute|estimate|run|build|price|analy[sz]e|create|make)\b/i;

/** Marks a scroller its page means to scroll sideways (a long code sample, a timeline). */
export const SCROLL_OK_ATTR = 'data-phone-scroll-ok';

/**
 * Runs in the page (pass to `page.evaluate`). Returns plain numbers and short
 * element descriptions; the judging is `phoneFailures`, below, so it can be
 * tested without a browser.
 */
export function measurePhone({ scrollOkAttr = SCROLL_OK_ATTR } = {}) {
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) return `${s}#${el.id}`;
    const cls = [...el.classList].slice(0, 2).join('.');
    if (cls) s += `.${cls}`;
    const label = el.getAttribute('aria-label') || el.getAttribute('name') || '';
    if (label) s += `[${label.slice(0, 40)}]`;
    const host = el.closest('[id]');
    return host && host !== el ? `#${host.id} ${s}` : s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[aria-hidden="true"],dialog:not([open])');
  };
  const out = {
    viewport: innerWidth,
    height: innerHeight,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0),
    swipes: [],
    smallFields: [],
    tallRows: [],
  };
  for (const el of document.querySelectorAll('body *')) {
    if (/^(INPUT|SELECT|TEXTAREA|OPTION|SCRIPT|STYLE|SVG|CANVAS|IFRAME|VIDEO|IMG)$/i.test(el.tagName)) continue;
    // A site or section nav strip that scrolls sideways is a designed pattern
    // (site-nav.mjs fades its edges and snaps the current link into view); the
    // probe is after content a visitor needs to read, not navigation.
    if (el.closest(`[${scrollOkAttr}], nav, [role="tablist"]`)) continue;
    if (el.scrollWidth <= el.clientWidth + 1 || el.clientWidth < 1) continue;
    const ox = getComputedStyle(el).overflowX;
    if (ox !== 'auto' && ox !== 'scroll') continue;
    if (!visible(el)) continue;
    // A scroller whose overflow is only a focus ring or a hanging glyph is not
    // a table the visitor has to swipe; count it when it holds real content.
    if (el.scrollWidth - el.clientWidth < 8) continue;
    out.swipes.push({ el: describe(el), content: el.scrollWidth, box: el.clientWidth });
  }
  const textInput = /^(|text|number|email|tel|url|search|password|date|datetime-local|month|time|week)$/;
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (el.tagName === 'INPUT' && !textInput.test((el.getAttribute('type') || '').toLowerCase())) continue;
    if (el.disabled || el.readOnly || !visible(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    out.smallFields.push({ el: describe(el), px });
  }
  for (const tr of document.querySelectorAll('table tr')) {
    const d = getComputedStyle(tr).display;
    if (d === 'table-row' || !visible(tr)) continue;
    out.tallRows.push({ el: describe(tr.closest('table')), px: tr.getBoundingClientRect().height });
  }
  return out;
}

/**
 * Failures for one page's measurement. `m` is what `measurePhone` returns;
 * `page` names it in the messages; `state` says when it was measured
 * ("at load", "with the example worked out").
 */
export function phoneFailures(m, { page, state = 'at load', minField = MIN_FIELD_PX, slack = SLACK_PX } = {}) {
  const at = `${page} at ${m.viewport}px ${state}`;
  const out = [];
  if (m.scrollWidth > m.viewport + slack) {
    out.push(`${at}: the page scrolls sideways (${m.scrollWidth}px wide in a ${m.viewport}px window)`);
  }
  for (const s of m.swipes || []) {
    out.push(`${at}: ${s.el} needs a sideways swipe (${s.content}px of content in a ${s.box}px box); stack it, or mark it ${SCROLL_OK_ATTR} if scrolling is the point`);
  }
  const small = (m.smallFields || []).filter((f) => Number.isFinite(f.px) && f.px < minField);
  if (small.length) {
    const sizes = [...new Set(small.map((f) => f.px))].sort((a, b) => a - b).join(', ');
    out.push(`${at}: ${small.length} form field(s) under ${minField}px (${sizes} px; iOS zooms on focus), first ${small[0].el}`);
  }
  const tall = (m.tallRows || []).filter((r) => r.px > m.height + slack);
  if (tall.length) {
    const worst = tall.reduce((a, b) => (b.px > a.px ? b : a));
    out.push(`${at}: ${tall.length} stacked table row(s) taller than the ${m.height}px screen (worst ${Math.ceil(worst.px)}px in ${worst.el})`);
  }
  return out;
}

/**
 * The slugs to probe. `doors` is front-doors.json; `industry` is one of its
 * industries, or "all". `extra` adds the paid product's own public pages
 * (front-doors.json maps free tools only).
 */
export function probeSlugs(doors, { industry = 'construction', extra = [] } = {}) {
  const tools = Object.entries(doors.tools || {})
    .filter(([, ind]) => industry === 'all' || ind === industry)
    .map(([slug]) => slug);
  return [...new Set([...extra, ...tools])].sort();
}

/** The bet's own public pages for an industry (not in front-doors.json, which maps free tools). */
export const PRODUCT_PAGES = {
  construction: ['pay-app-guides', 'pay-application-generator'],
  'eu-e-invoicing': ['einvoice-preflight'],
};

/** One line per page and state, for `--all`. */
export function probeRow(m, { page, state }) {
  const small = (m.smallFields || []).filter((f) => f.px < MIN_FIELD_PX).length;
  const tall = (m.tallRows || []).filter((r) => r.px > m.height + SLACK_PX).length;
  return `${page.padEnd(60)} ${String(m.viewport).padStart(4)} ${state.padEnd(10)} width ${String(m.scrollWidth).padStart(4)}  swipes ${(m.swipes || []).length}  small fields ${small}/${(m.smallFields || []).length}  tall rows ${tall}`;
}
