// @ts-check
// The Terms of Service, Privacy Policy and Data Processing Agreement of the hosted service
// (pro/legal/*.md), rendered once at start-up into same-origin HTML pages for /app/terms,
// /app/privacy and /app/dpa, with German and French translations (pro/legal/de, pro/legal/fr) at
// /app/de/... and /app/fr/...; the English text governs. Proprietary (see ../LICENSE,
// part 2). Zero dependencies: the renderer knows only the Markdown these files use (headings,
// paragraphs, "- " lists, pipe tables, **bold**), and escapes every character of text first, so the
// files cannot inject markup.
import { readAppText } from "./app-files.mjs";

/** @typedef {"terms" | "privacy" | "dpa"} LegalKey */
/** @typedef {{ key: LegalKey, title: string, version: string, markdown: string, html: string }} LegalDoc */

export const LEGAL_KEYS = /** @type {const} */ (["terms", "privacy", "dpa"]);

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

/** Languages the legal pages are also published in. The English text governs. */
export const LEGAL_LANGS = /** @type {const} */ (["de", "fr"]);
/** @typedef {"en" | (typeof LEGAL_LANGS)[number]} LegalLang */

/** @type {Record<LegalLang, { name: string, back: string, prefix: string }>} */
const LANG = {
  en: { name: "English", back: "← E-invoice workspace", prefix: "/app" },
  de: { name: "Deutsch", back: "← E-Rechnungs-Arbeitsbereich", prefix: "/app/de" },
  fr: { name: "Français", back: "← Espace e-facture", prefix: "/app/fr" },
};

/**
 * @param {LegalDoc} doc the page's document
 * @param {LegalDoc[]} all the documents in the same language, for the footer links
 * @param {LegalLang} lang
 * @param {LegalLang[]} langs the languages this document is served in (English first)
 */
function page(doc, all, lang, langs) {
  const L = LANG[lang];
  const others = all
    .filter((d) => d.key !== doc.key)
    .map((d) => `<a href="${L.prefix}/${d.key}">${escapeHtml(d.title)}</a>`)
    .join(" · ");
  const versions = langs
    .filter((l) => l !== lang)
    .map((l) => `<a href="${LANG[l].prefix}/${doc.key}" hreflang="${l}" lang="${l}">${LANG[l].name}</a>`)
    .join(" · ");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)} · ${escapeHtml(L.back.slice(2))}</title>
<link rel="stylesheet" href="/app/app.css">
</head>
<body>
<main class="legal">
<p><a href="/app">${escapeHtml(L.back)}</a>${versions ? ` · ${versions}` : ""}</p>
${doc.html}
<footer><p class="small">${others}</p></footer>
</main>
</body>
</html>
`;
}

/**
 * Read and render pro/legal/*.md, and the translations in pro/legal/<lang>/*.md. Throws at start-up
 * if an English file is missing or malformed, so a server never offers sign-up without its terms.
 * A translation is served only when it carries the English file's version: one left behind by a
 * change to the English text is listed in `staleTranslations` and not served (legal.test.mjs
 * fails on it), so a reader never gets an outdated translation as if it were current.
 * @param {(key: LegalKey, lang?: LegalLang) => string | null} [readDoc] null when a translation is missing
 * @returns {Record<LegalKey, LegalDoc & { page: string, translations: Partial<Record<LegalLang, LegalDoc & { page: string }>> }> & { staleTranslations: string[] }}
 */
export function loadLegal(readDoc = defaultRead) {
  const docs = LEGAL_KEYS.map((key) => {
    const markdown = /** @type {string} */ (readDoc(key));
    return { key, ...legalMeta(markdown), markdown, html: renderMarkdown(markdown) };
  });
  /** @type {string[]} */
  const staleTranslations = [];
  /** @type {Record<string, LegalDoc[]>} */
  const byLang = {};
  for (const lang of LEGAL_LANGS) {
    byLang[lang] = [];
    for (const en of docs) {
      const markdown = readDoc(en.key, lang);
      if (markdown == null) continue;
      const meta = legalMeta(markdown);
      if (meta.version !== en.version) {
        staleTranslations.push(`${lang}/${en.key}.md is version ${meta.version}, the English text is ${en.version}`);
        continue;
      }
      byLang[lang].push({ key: en.key, ...meta, markdown, html: renderMarkdown(markdown) });
    }
  }
  /** @param {LegalKey} key */
  const langsOf = (key) => /** @type {LegalLang[]} */ (["en", ...LEGAL_LANGS.filter((l) => byLang[l].some((d) => d.key === key))]);
  const out = Object.fromEntries(
    docs.map((d) => {
      const langs = langsOf(d.key);
      /** @type {Record<string, LegalDoc & { page: string }>} */
      const translations = {};
      for (const lang of LEGAL_LANGS) {
        const tr = byLang[lang].find((x) => x.key === d.key);
        if (tr) translations[lang] = { ...tr, page: page(tr, byLang[lang], lang, langs) };
      }
      return [d.key, { ...d, page: page(d, docs, "en", langs), translations }];
    }),
  );
  return /** @type {any} */ ({ ...out, staleTranslations });
}

/** @param {LegalKey} key @param {LegalLang} [lang] */
function defaultRead(key, lang) {
  const text = readAppText(lang && lang !== "en" ? `pro/legal/${lang}/${key}.md` : `pro/legal/${key}.md`);
  // A missing translation is null; a missing English text is an error.
  if (text === null && !(lang && lang !== "en")) throw new Error(`missing pro/legal/${key}.md`);
  return text;
}
