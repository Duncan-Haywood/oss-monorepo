// A small, safe Markdown-to-HTML renderer for the repository's own analysis
// documents (process reports, drift reports, studies). No dependencies: the
// Pages build runs with nothing installed. Everything is escaped first, so a
// document can never inject markup; only http(s), in-page and repository
// links survive, and repository paths become links to the file on GitHub.

export const REPO_BLOB = 'https://github.com/Duncan-Haywood/oss-monorepo/blob/main/';
export const REPO_PULL = 'https://github.com/Duncan-Haywood/oss-monorepo/pull/';
// Images need the file's bytes, not GitHub's file page; raw serves an SVG as image/svg+xml.
export const REPO_RAW = 'https://raw.githubusercontent.com/Duncan-Haywood/oss-monorepo/main/';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Resolve a link target written in `fromPath` (a repository path) to a URL, or null to drop it. */
export function resolveHref(href, fromPath = '') {
  const h = href.trim();
  if (/^https?:\/\//i.test(h)) return h;
  if (h.startsWith('#')) return h;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return null; // javascript:, data:, mailto: and friends
  const parts = (h.startsWith('/') ? [] : fromPath.split('/').slice(0, -1));
  for (const seg of h.replace(/^\//, '').split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return REPO_BLOB + parts.join('/');
}

/** An image source: http(s) kept, a repository path served raw from GitHub, anything else (data:, javascript:) dropped. */
export function resolveImageSrc(src, fromPath = '') {
  const url = resolveHref(src, fromPath);
  if (!url || url.startsWith('#')) return null;
  return url.startsWith(REPO_BLOB) ? REPO_RAW + url.slice(REPO_BLOB.length) : url;
}

// An HTML entity an author typed (&minus;, &radic;, &#8722;) is kept as itself after escaping, so
// the page shows "−" rather than the literal text "&minus;" (blog posts and research log lines on
// /updates/ did until 2026-11-14; the research pages' own builder got the same fix in PR #15883).
// Inside a code span it stays literal, which is how a post shows the entity's source. Safe: an
// entity decodes to text, never to markup (`&lt;b&gt;` reads as "<b>", it does not open a tag).
const TYPED_ENTITY = /&amp;(#\d{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g;
// What `esc` itself writes; *em* may open after any other entity (`*K*&radic;*P*`).
// A paired, attribute-free <sub>…</sub> or <sup>…</sup> (p<sub>s</sub>, CO<sub>2</sub>, N<sup>1.85</sup>)
// is the one raw HTML kept: seven posts used it and showed the tags as text until 2026-11-14. No
// attributes and a closing tag on the same line, so it cannot open anything else or run on.
const SUB_SUP = /&lt;(sub|sup)&gt;((?:(?!&lt;\/?su[bp]&gt;).){1,80}?)&lt;\/\1&gt;/g;
// *em* may also open after a slash or an opening quote: "1/*e*", "Deira/*de ira*" and "“*x*”" showed
// their asterisks until 2026-11-14 (CommonMark treats both as emphasis).
const EM_OPEN = /(^|[\s(/“‘]|&(?:quot|#39);|&(?!(?:amp|lt|gt|quot|#39);)#?[a-zA-Z0-9]+;)\*([^*\s.][^*]*)\*/g;
const EM_OPEN_PLAIN = /(^|[\s(/“‘]|&(?:quot|#39);)\*([^*\s.][^*]*)\*/g;
// A code span is a backtick run closed by a run of the same length, so `` `x` `` shows `x` with its
// backticks (one space either side trimmed, as CommonMark does). Only single runs matched until
// 2026-11-14, and double-backtick spans in eight posts showed as raw text.
const CODE_SPAN = /(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g;
const trimCode = (c) => (c.length > 2 && c.startsWith(' ') && c.endsWith(' ') && c.trim() ? c.slice(1, -1) : c);

/**
 * Inline spans on raw (unescaped) text. Code spans are cut out first so nothing inside them is formatted.
 * `entities: false` shows a typed entity as its source text, for text GitHub shows plainly (commit titles).
 */
export function inline(text, fromPath = '', { linkPrs = true, entities = true } = {}) {
  // Links first, so a label written in code (`[`file`](file)`) stays a link;
  // then code spans, so nothing inside them is formatted.
  // A link written wholly inside a code span (`[title](post.md)`) is shown as
  // its source text: `raw` keeps that source so the code span can put it back.
  const held = [];
  const raw = [];
  const hold = (html, src = '') => `\u0000${(raw.push(src), held.push(html)) - 1}\u0000`;
  // Images before links, so `![alt](src)` is not read as `!` plus a link.
  let s = String(text).replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (src, alt, href) => {
    const url = resolveImageSrc(href, fromPath);
    return hold(url ? `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" style="max-width:100%;height:auto">` : esc(alt), src);
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (src, label, href) => {
    const url = resolveHref(href, fromPath);
    const inner = inline(label, fromPath, { linkPrs: false, entities });
    return hold(url ? `<a href="${esc(url)}">${inner}</a>` : inner, src);
  });
  s = s.replace(CODE_SPAN, (_, _ticks, code) => hold(`<code>${esc(trimCode(code).replace(/\u0000(\d+)\u0000/g, (_m, i) => raw[Number(i)]))}</code>`));
  s = esc(s);
  // Tags before entities, so a typed "&lt;sub&gt;" stays text.
  if (entities) s = s.replace(SUB_SUP, '<$1>$2</$1>').replace(TYPED_ENTITY, '&$1;');
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(entities ? EM_OPEN : EM_OPEN_PLAIN, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s.,;:)]|$)/g, '$1<em>$2</em>');
  if (linkPrs) s = s.replace(/(^|[\s(])#(\d{3,5})\b/g, `$1<a href="${REPO_PULL}$2">#$2</a>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)]);
}

const isTableSep = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
// A cell may hold an escaped pipe, `\|` (GFM; also inside code, as in `` `\|\|` ``). Split on the
// others only, then unescape: four red-team posts showed "`\ \ &&`" for `||` → `&&` until 2026-11-14.
const cells = (line) =>
  line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

/**
 * Whether a table reads better as one card per row on a phone (`.stack`, styled in
 * `pf-site.css` by `STACK_TABLE_CSS`). Measured over the blog's 1,597 pages with tables at
 * 390 px on 2026-11-19: 108 of 202 tables with five to seven columns ran past their scroller,
 * against 8 of 350 four-column tables, and those 8 were the wordy ones. A long table stays a
 * table: thirty cards are harder to compare than one sideways scroll.
 */
export function stackTable(cols, rows) {
  if (rows.length === 0 || rows.length > STACK_MAX_ROWS) return false;
  if (cols >= 5) return true;
  if (cols < 4) return false;
  return meanCellChars(rows, 0) >= STACK_WORDY_CELL;
}
export const STACK_MAX_ROWS = 15;
export const STACK_WORDY_CELL = 18;
/**
 * Below this mean (scores, counts, yes/no), a stacked card sets its label / value pairs two to
 * a line (`.stack.compact`): a nine-column score table went from 262 px to 1,454 px as one
 * pair per line, and to about half that two-up.
 */
export const STACK_COMPACT_CELL = 10;

/** Text without markup: removes tags until none are left, so `<<b>script>` cannot reassemble one. */
const stripTags = (s) => {
  let prev;
  do { prev = s; s = s.replace(/<[^>]+>/g, ''); } while (s !== prev);
  return s;
};

// `from` = 1 skips the row-name column, which becomes the card's title.
const meanCellChars = (rows, from = 1) => {
  const body = rows.flatMap((r) => r.slice(from)).map((c) => stripTags(String(c)).trim());
  return body.reduce((n, c) => n + c.length, 0) / Math.max(1, body.length);
};

/** A cell's label for `data-label`: the header's text, without markup, attribute-safe. */
const labelOf = (cellHtml) =>
  stripTags(String(cellHtml)).replace(/\s+/g, ' ').trim().replace(/"/g, '&quot;');

/**
 * A cell that reads as one figure: a count, amount, percentage, ratio or measured time, with an
 * optional sign, currency, approximation mark and short unit (`$2,853.20`, `-0.12`, `~40%`,
 * `3.1x`, `250 ms`). Ranges, intervals and words are not figures.
 */
export const NUMERIC_CELL = /^[~≈<>≤≥±]?\s*[+\-−]?\s*[$€£]?\s*\d[\d,]*(\.\d+)?\s*(%|x|×|k|K|M|B|ms|s|px|h|pp|GB|MB|kB)?$/;
const BLANK_CELL = /^(|—|–|-|n\/a|N\/A)$/;

/** GFM column alignment from the separator row: 'left', 'right', 'center' or ''. */
export const columnAlign = (sepLine) =>
  cells(sepLine).map((c) => (c.endsWith(':') ? (c.startsWith(':') ? 'center' : 'right') : c.startsWith(':') ? 'left' : ''));

/**
 * Which columns set as figures (`class="num"`: right-aligned, tabular digits, so place values
 * line up and a figure sits under its header). Polish, 2026-11-20: 1,197 of the blog's 1,983
 * tables had a column of figures, all left-aligned, and 130 posts' `---:` markers were ignored.
 * An author's marker wins; otherwise a column after the first (the row names) counts when every
 * non-blank body cell is one figure.
 */
export function numericColumns(rowsHtml, cols, align = []) {
  const out = [];
  for (let j = 0; j < cols; j++) {
    if (align[j] === 'right') { out.push(true); continue; }
    if (align[j] || j === 0) { out.push(false); continue; }
    const vals = rowsHtml.map((r) => stripTags(String(r[j] ?? '')).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()).filter((v) => !BLANK_CELL.test(v));
    out.push(vals.length > 0 && vals.every((v) => NUMERIC_CELL.test(v)));
  }
  return out;
}

/**
 * One GFM table. A `.stack` table carries ARIA table roles (Safari drops table semantics
 * from `display:block` rows) and labels every body cell with its column's header.
 */
export function renderTable(headHtml, rowsHtml, align = []) {
  const num = numericColumns(rowsHtml, headHtml.length, align);
  const nc = (j) => (num[j] ? ' class="num"' : '');
  if (!stackTable(headHtml.length, rowsHtml)) {
    return (
      `<div class="scroll"><table><thead><tr>${headHtml.map((c, j) => `<th${nc(j)}>${c}</th>`).join('')}</tr></thead><tbody>` +
      rowsHtml.map((r) => `<tr>${r.map((c, j) => `<td${nc(j)}>${c}</td>`).join('')}</tr>`).join('') +
      '</tbody></table></div>'
    );
  }
  const labels = headHtml.map(labelOf);
  return (
    `<div class="scroll"><table class="stack${meanCellChars(rowsHtml) < STACK_COMPACT_CELL ? ' compact' : ''}" role="table"><thead role="rowgroup"><tr role="row">${headHtml.map((c, j) => `<th role="columnheader"${nc(j)}>${c}</th>`).join('')}</tr></thead><tbody role="rowgroup">` +
    rowsHtml
      .map((r) => `<tr role="row">${r.map((c, j) => `<td role="cell"${nc(j)}${labels[j] ? ` data-label="${labels[j]}"` : ''}>${c}</td>`).join('')}</tr>`)
      .join('') +
    '</tbody></table></div>'
  );
}

/**
 * Block-level rendering. Handles headings, fenced code, lists, tables, quotes and paragraphs.
 *
 * The page owns `<h1>`. With `dropTitle` the source's `# ` title is that h1,
 * so `##` renders as `<h2>` (levels as written, never above h2). Before
 * 2026-11-11 every level moved down one, so each blog post went h1 -> h3 and
 * failed Lighthouse's heading-order audit (352 of the site's pages). Without
 * `dropTitle` the source's own `#` is not the page title and moves down one.
 */
export function renderMarkdown(src, { fromPath = '', dropTitle = false, shift = dropTitle ? 0 : 1 } = {}) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;
  let droppedTitle = !dropTitle;
  const para = [];
  const flush = () => {
    if (para.length) html.push(`<p>${inline(para.join(' '), fromPath)}</p>`);
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      const fence = line.trim().slice(0, 3);
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++;
      html.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      flush();
      i++;
      if (!droppedTitle && m[1].length === 1) {
        droppedTitle = true;
        continue;
      }
      const level = Math.min(6, Math.max(2, m[1].length + shift)); // the page owns <h1>
      html.push(`<h${level}>${inline(m[2], fromPath)}</h${level}>`);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const head = cells(line);
      const align = columnAlign(lines[i + 1]);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      html.push(renderTable(head.map((c) => inline(c, fromPath)), rows.map((r) => r.map((c) => inline(c, fromPath))), align));
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      html.push(`<blockquote>${renderMarkdown(body.join('\n'), { fromPath, shift })}</blockquote>`);
      continue;
    }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+/.exec(line))) {
      flush();
      const ordered = /\d/.test(m[2]);
      const indent = m[1].length;
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const im = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
        if (im && im[1].length === indent) {
          items.push([im[3]]);
          i++;
        } else if (l.trim() && items.length && /^\s+/.test(l) && (!im || im[1].length > indent)) {
          items[items.length - 1].push(l.slice(Math.min(indent + 2, l.length - l.trimStart().length)));
          i++;
        } else if (!l.trim() && i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) && items.length) {
          items[items.length - 1].push('');
          i++;
        } else break;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(
        `<${tag}>${items
          .map((it) => {
            const [first, ...rest] = it;
            const nested = rest.some((r) => /^\s*([-*+]|\d+[.)])\s+/.test(r) || r === '');
            return nested
              ? `<li>${inline(first, fromPath)}${renderMarkdown(rest.join('\n'), { fromPath, shift })}</li>`
              : `<li>${inline([first, ...rest.map((r) => r.trim())].join(' '), fromPath)}</li>`;
          })
          .join('')}</${tag}>`,
      );
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      html.push('<hr>');
      i++;
      continue;
    }
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return html.join('\n');
}

/** The first `# ` heading, or null. */
export function titleOf(src) {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(String(src));
  return m ? m[1].replace(/`/g, '') : null;
}

/** First prose paragraph after the title, as plain text, trimmed to `max` characters. */
export function summaryOf(src, max = 280) {
  const blocks = String(src).replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  for (const b of blocks) {
    const t = b.trim();
    if (!t || /^(#|```|\||>|<!--)/.test(t)) continue;
    const plain = t
      .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[`*_]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (plain.length < 20) continue;
    return plain.length > max ? `${plain.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : plain;
  }
  return '';
}
