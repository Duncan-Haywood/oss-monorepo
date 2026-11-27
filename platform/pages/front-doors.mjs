// Front doors: a compact, honest line on a free tool page (or a category or
// audience page) naming the paid SMB product its visitors are plausibly
// customers for, linking that product's industry page (`industries/<id>/`).
//
// The mapping is `front-doors.json`, written by `front-doors-map.mjs` (rules
// and hand lists, with the reasons). Unmapped pages get nothing.
//
// Honesty (owner, 2026-11-24): the line says what the product is and its real
// status ("in development — early access", or "open — free on one job" for a
// hosted app with a free plan and no paid plan on sale), and that it is separate from the
// free tool, which stays free. It never implies the free tool is part of it.
//
// A door renders only when its industry page is in the built site, so a door
// never links a page that does not exist yet: tool pages ask `liveIndustries`
// when the chrome is added; category pages are written earlier and pruned at
// the end of the build (`pruneDoors`).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const FRONT_DOORS = JSON.parse(readFileSync(new URL('./front-doors.json', import.meta.url), 'utf8'));

/** Marks every door, with its industry id, so a late pass can find and drop it. */
export const DOOR_ATTR = 'data-pf-door';

export const INDUSTRIES_PREFIX = 'industries';

export function industryPagePath(id) {
  return `${INDUSTRIES_PREFIX}/${id}/`;
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The industry id a tool slug is a front door to, or null. */
export function toolDoor(slug, map = FRONT_DOORS) {
  return Object.hasOwn(map.tools, slug) ? map.tools[slug] : null;
}

/** The industry id a category or audience page (`c/<id>/`) is a front door to, or null. */
export function pageDoor(pageId, map = FRONT_DOORS) {
  return Object.hasOwn(map.pages, pageId) ? map.pages[pageId] : null;
}

/** The industry ids whose page is in the built site at `outDir`. */
export function liveIndustries(outDir, map = FRONT_DOORS) {
  return new Set(Object.keys(map.industries).filter((id) => existsSync(path.join(outDir, INDUSTRIES_PREFIX, id, 'index.html'))));
}

function doorBody(id, toRoot, map) {
  const industry = map.industries[id];
  if (!industry) return '';
  const href = `${toRoot}${industryPagePath(id)}`;
  // `data-pf-to` rides the chrome's existing local click counter
  // (`cross_tool_click:industry:<id>`), so a door's clicks are measured with
  // no new script.
  return `<strong>${escapeHtml(industry.status)}:</strong> ${escapeHtml(industry.product)}. <a href="${escapeHtml(href)}" data-pf-to="${escapeHtml(`industry:${id}`)}">${escapeHtml(industry.label)}: ${industry.open ? 'start free, or see what it does' : 'see what is being built'} →</a>`;
}

/** The footer line on a mapped tool page, or '' (unmapped, or industry page not live). */
export function renderToolDoor({ slug, toRoot, live, map = FRONT_DOORS }) {
  const id = toolDoor(slug, map);
  if (!id || (live && !live.has(id))) return '';
  const body = doorBody(id, toRoot, map);
  if (!body) return '';
  return `    <p class="pf-door" ${DOOR_ATTR}="${escapeHtml(id)}">${body} A separate product; this tool stays free.</p>\n`;
}

/** The line under a mapped category or audience page's hero, or ''. */
export function renderPageDoor({ pageId, toRoot, map = FRONT_DOORS }) {
  const id = pageDoor(pageId, map);
  if (!id) return '';
  const body = doorBody(id, toRoot, map);
  if (!body) return '';
  return `\n    <p class="door" ${DOOR_ATTR}="${escapeHtml(id)}">${body} A separate product; the tools on this page stay free.</p>`;
}

const DOOR_BLOCK = new RegExp(`\\n?[ \\t]*<p class="(?:pf-door|door)" ${DOOR_ATTR}="([a-z0-9-]+)">[\\s\\S]*?</p>\\n?`, 'g');

/** `html` without the doors whose industry is not in `live`. */
export function pruneDoors(html, live) {
  return html.replace(DOOR_BLOCK, (block, id) => {
    if (live.has(id)) return block;
    // Keep the line break the block sat on, so the markup around it is unchanged.
    return block.startsWith('\n') && block.endsWith('\n') ? '\n' : '';
  });
}
