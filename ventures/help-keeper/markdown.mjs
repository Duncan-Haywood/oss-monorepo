// A small, safe Markdown renderer for help articles. Browser-safe. Input is escaped first; only the tags built here can appear in output.
// Supported: # headings, paragraphs, - * + and 1. lists, > quotes, ``` code blocks, `code`, **bold**, *italic*, [text](url), ![alt](https://url), ---
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// Only these link targets survive: http(s), mailto, same-site paths and #anchors. javascript:, data: and the rest become plain text.
export function safeUrl(u, { imageOnly = false } = {}) {
  const s = String(u).trim().replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (imageOnly) return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null;
  if (/^(https?:\/\/|mailto:)[^"'<>]+$/i.test(s)) return s;
  if (/^(\/(?!\/)|#)[^"'<>]*$/.test(s)) return s;
  return null;
}

function inline(raw) {
  const codes = [];
  let s = esc(raw).replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => { const u = safeUrl(url.replace(/&amp;/g, "&"), { imageOnly: true }); return u ? `<img src="${esc(u)}" alt="${alt}" loading="lazy">` : alt; });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => { const u = safeUrl(url.replace(/&amp;/g, "&")); return u ? `<a href="${esc(u)}"${/^https?:/i.test(u) ? ' rel="noopener nofollow"' : ""}>${text}</a>` : text; });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

export function render(md) {
  const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [], toc = [], used = new Map();
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^```/.test(line)) {
      flush(); const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); continue;
    }
    if ((m = /^(#{1,4})\s+(.+?)\s*#*$/.exec(line))) {
      flush(); const level = Math.max(2, m[1].length + 1); // article title is the h1
      let id = slugify(m[2]) || "section"; const n = used.get(id) || 0; used.set(id, n + 1); if (n) id += `-${n + 1}`;
      if (level <= 3) toc.push({ id, text: m[2].replace(/[*`_]/g, ""), level });
      out.push(`<h${level} id="${esc(id)}">${inline(m[2])}</h${level}>`); i++; continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(line)) { flush(); const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, "")); out.push(`<blockquote>${render(q.join("\n")).html}</blockquote>`); continue; }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line))) {
      flush(); const ordered = /\d/.test(m[2]), items = [];
      while (i < lines.length && (m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]))) {
        let text = m[3]; i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s/.test(lines[i])) text += " " + lines[i++].trim();
        items.push(`<li>${inline(text)}</li>`);
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`); continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flush();
  return { html: out.join("\n"), toc };
}

// Plain text of the body for search and snippets: no markup characters, link text kept.
export function plain(md) {
  return String(md ?? "").replace(/```[\s\S]*?```/g, (b) => b.replace(/```\w*/g, " ")).replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^>\s?/gm, "").replace(/^\s*([-*+]|\d+[.)])\s+/gm, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
}

export function headings(md) {
  return [...String(md ?? "").replace(/```[\s\S]*?```/g, "").matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map((m) => m[1].replace(/[*_`]/g, ""));
}
