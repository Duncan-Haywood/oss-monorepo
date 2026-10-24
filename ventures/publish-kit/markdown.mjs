// @ts-check
// A small Markdown -> XHTML converter for book chapters: headings, paragraphs,
// emphasis, inline code, links, images, block quotes, flat lists, fenced code,
// and "* * *" / "---" scene breaks. Output is well-formed XHTML (every tag
// closed, every attribute quoted, text escaped), which EPUB readers require
// and HTML readers accept. Raw HTML in the source is escaped, not passed
// through. Pure and browser-safe.

import { xml } from './util.mjs';

/**
 * @param {string} s
 * @param {string[]} images collects every image src it meets
 */
function inline(s, images) {
  const codes = /** @type {string[]} */ ([]);
  let t = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  t = xml(t);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, src) => {
    images.push(src.replace(/&amp;/g, '&'));
    return `<img src="${src}" alt="${alt}"/>`;
  });
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`);
  t = t.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)|(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g,
    (_, p1, a, p3, b) => `${p1 ?? p3}<em>${a ?? b}</em>`);
  t = t.replace(/ {2,}$/, '<br/>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${xml(codes[Number(i)])}</code>`);
}

/**
 * @param {string} md
 * @returns {{title: string, body: string, images: string[]}}
 *   title: the first heading's text ("" if none); body: XHTML fragment.
 */
export function markdownToXhtml(md) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = /** @type {string[]} */ ([]);
  const images = /** @type {string[]} */ ([]);
  let title = '';
  let para = /** @type {string[]} */ ([]);
  const flush = () => {
    if (para.length) out.push(`<p>${para.map((l) => inline(l, images)).join('\n')}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^(```|~~~)/);
    if (fence) {
      flush();
      const code = [];
      while (++i < lines.length && !lines[i].startsWith(fence[1])) code.push(lines[i]);
      out.push(`<pre><code>${xml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      flush();
      const level = h[1].length;
      if (!title) title = h[2].replace(/[*_`]/g, '');
      out.push(`<h${level}>${inline(h[2], images)}</h${level}>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push('<hr class="scene-break"/>');
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      i--;
      out.push(`<blockquote>${markdownToXhtml(quote.join('\n')).body}</blockquote>`);
      continue;
    }
    const li = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      flush();
      const ordered = /\d/.test(li[1]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (!m || /\d/.test(m[1]) !== ordered) break;
        items.push(`<li>${inline(m[2], images)}</li>`);
        i++;
      }
      i--;
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    para.push(line.trim() === line ? line : line.trimStart());
  }
  flush();
  return { title, body: out.join('\n'), images };
}
