// A small, safe Markdown-to-HTML renderer for the repository's own analysis
// documents (process reports, drift reports, studies). No dependencies: the
// Pages build runs with nothing installed. Everything is escaped first, so a
// document can never inject markup; only http(s), in-page and repository
// links survive, and repository paths become links to the file on GitHub.

export const REPO_BLOB = 'https://github.com/Duncan-Haywood/oss-monorepo/blob/main/';
export const REPO_PULL = 'https://github.com/Duncan-Haywood/oss-monorepo/pull/';

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

/** Inline spans on raw (unescaped) text. Code spans are cut out first so nothing inside them is formatted. */
export function inline(text, fromPath = '', { linkPrs = true } = {}) {
  // Links first, so a label written in code (`[`file`](file)`) stays a link;
  // then code spans, so nothing inside them is formatted.
  const held = [];
  const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
  let s = String(text).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const url = resolveHref(href, fromPath);
    const inner = inline(label, fromPath, { linkPrs: false });
    return hold(url ? `<a href="${esc(url)}">${inner}</a>` : inner);
  });
  s = s.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${esc(code)}</code>`));
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s.,;:)]|$)/g, '$1<em>$2</em>');
  if (linkPrs) s = s.replace(/(^|[\s(])#(\d{3,5})\b/g, `$1<a href="${REPO_PULL}$2">#$2</a>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)]);
}

const isTableSep = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** Block-level rendering. Handles headings, fenced code, lists, tables, quotes and paragraphs. */
export function renderMarkdown(src, { fromPath = '', dropTitle = false } = {}) {
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
      const level = Math.min(6, m[1].length + 1); // the page owns <h1>
      html.push(`<h${level}>${inline(m[2], fromPath)}</h${level}>`);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      html.push(
        `<div class="scroll"><table><thead><tr>${head.map((c) => `<th>${inline(c, fromPath)}</th>`).join('')}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, fromPath)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table></div>',
      );
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      html.push(`<blockquote>${renderMarkdown(body.join('\n'), { fromPath })}</blockquote>`);
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
              ? `<li>${inline(first, fromPath)}${renderMarkdown(rest.join('\n'), { fromPath })}</li>`
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
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[`*_]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (plain.length < 20) continue;
    return plain.length > max ? `${plain.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : plain;
  }
  return '';
}
