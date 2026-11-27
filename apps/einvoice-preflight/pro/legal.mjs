// @ts-check
// The Terms of Service and Privacy Policy of the hosted service (pro/legal/*.md), rendered once at
// start-up into same-origin HTML pages for /app/terms and /app/privacy. FSL-1.1-MIT (see ../LICENSE,
// part 2). Zero dependencies: the renderer knows only the Markdown these two files use (headings,
// paragraphs, "- " lists, pipe tables, **bold**), and escapes every character of text first, so the
// files cannot inject markup.
import { readFileSync } from "node:fs";

/** @typedef {"terms" | "privacy"} LegalKey */
/** @typedef {{ key: LegalKey, title: string, version: string, markdown: string, html: string }} LegalDoc */

export const LEGAL_KEYS = /** @type {const} */ (["terms", "privacy"]);

/** @param {string} s */
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Escape, then turn **x** into <strong>x</strong>. @param {string} s */
const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

/** @param {string} line */
const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/**
 * The subset of Markdown the legal files use, to HTML.
 * @param {string} md
 */
export function renderMarkdown(md) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  let para = [];
  /** @type {string[] | null} */
  let list = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
    if (list) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      flush();
      const n = heading[1].length;
      out.push(`<h${n}>${inline(heading[2].trim())}</h${n}>`);
    } else if (/^\s*\|/.test(line)) {
      flush();
      /** @type {string[]} */
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const [head, sep, ...body] = rows;
      if (!sep || !/^[\s|:-]+$/.test(sep)) throw new Error("a table needs a header row and a | --- | separator row");
      out.push(
        `<table><thead><tr>${cells(head)
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
      );
    } else if (/^- /.test(line)) {
      if (para.length) {
        out.push(`<p>${inline(para.join(" "))}</p>`);
        para = [];
      }
      (list ??= []).push(line.slice(2).trim());
    } else if (!line.trim()) {
      flush();
    } else if (list && /^\s+\S/.test(line)) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out.join("\n");
}

/**
 * Title and version of a legal file, which must start with "# Title" and carry a
 * "**Version YYYY-MM-DD**" line.
 * @param {string} md
 */
export function legalMeta(md) {
  const title = /^# (.+)$/m.exec(md)?.[1]?.trim();
  const version = /\*\*Version (\d{4}-\d{2}-\d{2})\*\*/.exec(md)?.[1];
  if (!title || !version) throw new Error('a legal file needs a "# Title" and a "**Version YYYY-MM-DD**" line');
  return { title, version };
}

/** @param {LegalDoc} doc @param {LegalDoc[]} all */
function page(doc, all) {
  const others = all
    .filter((d) => d.key !== doc.key)
    .map((d) => `<a href="/app/${d.key}">${escapeHtml(d.title)}</a>`)
    .join(" · ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)} · E-invoice workspace</title>
<link rel="stylesheet" href="/app/app.css">
</head>
<body>
<main class="legal">
<p><a href="/app">← E-invoice workspace</a></p>
${doc.html}
<footer><p class="small">${others}</p></footer>
</main>
</body>
</html>
`;
}

/**
 * Read and render pro/legal/*.md. Throws at start-up if one is missing or malformed, so a server
 * never offers sign-up without its terms.
 * @param {(key: LegalKey) => string} [readDoc]
 * @returns {Record<LegalKey, LegalDoc & { page: string }>}
 */
export function loadLegal(readDoc = (key) => readFileSync(new URL(`./legal/${key}.md`, import.meta.url), "utf8")) {
  const docs = LEGAL_KEYS.map((key) => {
    const markdown = readDoc(key);
    return { key, ...legalMeta(markdown), markdown, html: renderMarkdown(markdown) };
  });
  return /** @type {any} */ (Object.fromEntries(docs.map((d) => [d.key, { ...d, page: page(d, docs) }])));
}
