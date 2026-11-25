// Labels the cells of a venture's `<table class="stack">` at build time.
//
// Why this exists (polish, 2026-11-25)
// ------------------------------------
// The phone card layout (`STACK_TABLE_CSS` in site-nav.mjs) prints each cell's
// `data-label` as the label beside its value, and needs ARIA roles because
// `display:block` drops a table's row and cell semantics. The blog's Markdown
// tables get both from `platform/devlog/markdown.mjs`; a venture's hand-written
// HTML had to type them on every cell. pay-app-guides did (25 pages), and a
// later PR adding four rows to its retainage table forgot them, which its page
// test had to catch. Measured the same day at 390 px: 98 read-only tables on the
// paid products' pages ran past their scroll box, none of them opted in.
//
// So a venture writes `class="stack"` and a `<thead>`, and this pass writes the
// rest: each body cell's `data-label` from its column's header text, and the
// roles. Cells that already carry a `data-label` or a `role` keep their own, so
// running it twice, or on a page that labels by hand, changes nothing.
//
// Skips what reflow.mjs skips (comments, scripts, styles, textareas: a table a
// script assembles as a string is not markup), and any stack table with another
// table inside it, where column counting would be guesswork.

const OPAQUE = [
  { open: /^<!--/, close: '-->' },
  { open: /^<script\b/i, close: '</script>' },
  { open: /^<style\b/i, close: '</style>' },
  { open: /^<textarea\b/i, close: '</textarea>' },
];

const STACK_CLASS = /\bclass\s*=\s*(["'])(?:[^"']*\s)?stack(?:\s[^"']*)?\1/i;

/** Text without markup or extra space, safe inside a double-quoted attribute. */
export function labelText(cellHtml) {
  let s = String(cellHtml);
  let prev;
  do { prev = s; s = s.replace(/<[^>]*>/g, ''); } while (s !== prev);
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&(?![a-z]+;|#\d+;|#x[0-9a-f]+;)/gi, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

const addAttr = (openTag, attr) => openTag.replace(/^(<[a-z]+)/i, `$1 ${attr}`);
const hasAttr = (openTag, name) => new RegExp(`\\s${name}\\s*=`, 'i').test(openTag);
const withRole = (openTag, role) => (hasAttr(openTag, 'role') ? openTag : addAttr(openTag, `role="${role}"`));
const span = (openTag) => {
  const m = openTag.match(/\scolspan\s*=\s*["']?(\d+)/i);
  return m ? Math.max(1, Number(m[1])) : 1;
};

/** One stack table's markup, labelled. Returns it unchanged when it has no header row. */
function labelTable(table) {
  const head = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
  if (!head) return table;
  const headRow = head[1].match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
  if (!headRow) return table;
  const labels = [];
  for (const m of headRow[1].matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi)) {
    const text = labelText(m[2]);
    for (let i = 0; i < span(`<th${m[1]}>`); i += 1) labels.push(text);
  }
  if (labels.length === 0) return table;

  let out = table.replace(/^<table\b[^>]*>/i, (t) => withRole(t, 'table'));
  out = out.replace(/<t(?:head|body|foot)\b[^>]*>/gi, (t) => withRole(t, 'rowgroup'));
  out = out.replace(/<thead\b[^>]*>[\s\S]*?<\/thead>/i, (block) =>
    block
      .replace(/<tr\b[^>]*>/gi, (t) => withRole(t, 'row'))
      .replace(/<th\b[^>]*>/gi, (t) => withRole(t, 'columnheader')),
  );
  // Every row after the header, with or without a written `<tbody>` (the parser adds one).
  const bodyAt = out.search(/<\/thead\s*>/i);
  out = out.slice(0, bodyAt) + out.slice(bodyAt).replace(/[\s\S]*/, (block) =>
    block.replace(/(<tr\b[^>]*>)([\s\S]*?)(?=<\/tr>|<tr\b|<\/t(?:body|foot)>|<\/table>)/gi, (_, tr, cells) => {
      let col = 0;
      const row = cells.replace(/<t([dh])\b[^>]*>/gi, (tag, kind) => {
        const at = col;
        col += span(tag);
        if (kind.toLowerCase() === 'h') return withRole(tag, /\bscope\s*=\s*["']?row/i.test(tag) ? 'rowheader' : 'cell');
        let next = withRole(tag, 'cell');
        if (!hasAttr(next, 'data-label') && labels[at]) next = addAttr(next, `data-label="${labels[at]}"`);
        return next;
      });
      return withRole(tr, 'row') + row;
    }),
  );
  return out;
}

/**
 * Labels every top-level `<table class="stack">` in a page. Returns the input
 * itself when nothing changed, so the build can count the pages it touched.
 */
export function labelStackTables(html) {
  if (typeof html !== 'string' || !/<table\b[^>]*\bstack\b/i.test(html)) return html;
  const lower = html.toLowerCase();
  const out = [];
  let cursor = 0;
  let index = 0;
  let depth = 0;
  let start = -1;
  let nested = false;
  while (index < html.length) {
    const next = html.indexOf('<', index);
    if (next === -1) break;
    const rest = html.slice(next, next + 12);
    const opaque = OPAQUE.find((region) => region.open.test(rest));
    if (opaque) {
      const end = lower.indexOf(opaque.close, next);
      index = end === -1 ? html.length : end + opaque.close.length;
      continue;
    }
    if (/^<table\b/i.test(rest)) {
      if (depth === 0) {
        const tagEnd = html.indexOf('>', next);
        start = STACK_CLASS.test(html.slice(next, tagEnd + 1)) ? next : -1;
        nested = false;
      } else {
        nested = true;
      }
      depth += 1;
      index = next + 6;
      continue;
    }
    if (/^<\/table\s*>/i.test(rest)) {
      const close = html.indexOf('>', next) + 1;
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start >= 0 && !nested) {
        out.push(html.slice(cursor, start), labelTable(html.slice(start, close)));
        cursor = close;
      }
      if (depth === 0) start = -1;
      index = close;
      continue;
    }
    index = next + 1;
  }
  if (out.length === 0) return html;
  out.push(html.slice(cursor));
  const joined = out.join('');
  return joined === html ? html : joined;
}
