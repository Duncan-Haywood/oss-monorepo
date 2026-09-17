// Deterministic llms.txt builder + validator, following the llmstxt.org
// convention: an H1 title, an optional blockquote summary, optional free
// paragraphs, then "## Section" headings each holding a bullet list of
// Markdown links ("- [title](url): optional note"). No network call lives
// here -- this module only turns structured input into text (and text back
// into a structural report) -- so the identical logic runs in the browser
// page (pasted input) and the Node CLI (files read from disk or fetched).

const LINK_RE = /^-\s*\[([^\]]+)\]\(([^)]+)\)\s*(?::\s*(.*))?$/;

// --- building ---------------------------------------------------------

/**
 * @param {{title: string, summary?: string, details?: string, sections: {heading: string, links: {title: string, url: string, note?: string}[]}[]}} spec
 * @returns {string}
 */
export function buildLlmsTxt({ title, summary, details, sections }) {
  const t = String(title ?? "").trim();
  if (!t) throw new Error("A title is required to build llms.txt (used as the H1).");
  const lines = [`# ${t}`, ""];

  const s = String(summary ?? "").trim();
  if (s) {
    lines.push(`> ${s}`, "");
  }

  const d = String(details ?? "").trim();
  if (d) {
    lines.push(d, "");
  }

  for (const section of sections || []) {
    const heading = String(section.heading ?? "").trim();
    if (!heading) continue;
    const links = (section.links || []).filter((l) => l && l.url && String(l.url).trim());
    if (!links.length) continue;
    lines.push(`## ${heading}`);
    for (const link of links) {
      const linkTitle = String(link.title ?? link.url).trim();
      const url = String(link.url).trim();
      const note = String(link.note ?? "").trim();
      lines.push(`- [${linkTitle}](${url})${note ? `: ${note}` : ""}`);
    }
    lines.push("");
  }

  // Exactly one trailing newline, no trailing blank-line stack.
  return lines.join("\n").replace(/\n+$/, "\n");
}

// --- validating ---------------------------------------------------------

/**
 * Structural check against the llmstxt.org shape. Not a certifier of every
 * rule the convention could imply -- see README for exactly what is and
 * isn't covered.
 * @param {string} text
 */
export function validateLlmsTxt(text) {
  const raw = String(text ?? "");
  const lines = raw.split(/\r?\n/);
  const nonBlank = lines.map((line, i) => ({ line, i })).filter((l) => l.line.trim() !== "");

  const errors = [];
  const warnings = [];

  if (!nonBlank.length) {
    errors.push("File is empty.");
    return { valid: false, errors, warnings, hasTitle: false, hasSummary: false, sections: [] };
  }

  const first = nonBlank[0].line.trim();
  const hasTitle = /^#\s+\S/.test(first) && !/^##/.test(first);
  if (!hasTitle) errors.push('First non-blank line must be a single "# Title" (H1), not a section heading or plain text.');

  const hasSummary = nonBlank.slice(1, 3).some((l) => /^>\s*\S/.test(l.line.trim()));
  if (!hasSummary) warnings.push('No blockquote summary ("> One-line description") right after the title. Recommended, not required.');

  const sections = [];
  let current = null;
  const seenUrls = new Set();

  for (const { line, i } of nonBlank) {
    const trimmed = line.trim();
    if (/^##\s+\S/.test(trimmed)) {
      current = { heading: trimmed.replace(/^##\s+/, ""), links: [], lineNo: i + 1 };
      sections.push(current);
      continue;
    }
    if (/^-\s/.test(trimmed) || trimmed === "-") {
      if (!current) {
        errors.push(`Line ${i + 1}: a link bullet appears before any "## Section" heading.`);
        continue;
      }
      const m = trimmed.match(LINK_RE);
      if (!m) {
        errors.push(`Line ${i + 1}: link bullet is not "- [title](url)" or "- [title](url): note" -- found: ${trimmed}`);
        continue;
      }
      const [, linkTitle, url, note] = m;
      current.links.push({ title: linkTitle, url, note: note || null, lineNo: i + 1 });
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
        warnings.push(`Line ${i + 1}: "${url}" is not an absolute URL (with scheme). llms.txt is often read out of the site's own context, so a relative link can silently break.`);
      }
      const key = url.trim();
      if (seenUrls.has(key)) {
        warnings.push(`Line ${i + 1}: "${url}" is linked more than once.`);
      }
      seenUrls.add(key);
    }
  }

  const sectionCount = sections.length;
  const linkCount = sections.reduce((n, s) => n + s.links.length, 0);
  if (sectionCount === 0) warnings.push('No "## Section" headings found. The convention groups links under H2 sections (e.g. "## Docs").');
  if (linkCount === 0) errors.push('No Markdown links ("[title](url)") found under any section. Link sections are the whole point of llms.txt.');

  const emptySections = sections.filter((s) => s.links.length === 0);
  for (const s of emptySections) warnings.push(`Section "${s.heading}" (line ${s.lineNo}) has no links.`);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    hasTitle,
    hasSummary,
    sections: sections.map((s) => ({ heading: s.heading, linkCount: s.links.length })),
    linkCount,
  };
}

// --- parsing pasted sitemap.xml -----------------------------------------

/**
 * Extracts <loc> URLs from a sitemap.xml (or sitemap index) document. Text
 * in, text out -- no XML parser dependency, since a sitemap's <loc> is
 * always a single well-formed element with no nested markup.
 * @param {string} xml
 * @returns {string[]}
 */
export function parseSitemapXml(xml) {
  const text = String(xml ?? "");
  const matches = text.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi);
  const urls = [];
  for (const m of matches) {
    const decoded = m[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (decoded) urls.push(decoded);
  }
  return urls;
}

// --- parsing the "## Section / path | title | description" mini-format --

/**
 * The input format both the browser page and the CLI's --urls-file share:
 * blank lines and "#"-prefixed comment lines are ignored, a line starting
 * with "## " opens a new section, and any other non-blank line is
 * "url | title | description" (title and description optional).
 * @param {string} text
 * @returns {{heading: string, links: {title: string, url: string, note?: string}[]}[]}
 */
export function parseSectionedInput(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const sections = [];
  let current = null;
  const ensureDefault = () => {
    if (!current) {
      current = { heading: "Docs", links: [] };
      sections.push(current);
    }
    return current;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("##")) {
      current = { heading: line.replace(/^##\s*/, "").trim() || "Docs", links: [] };
      sections.push(current);
      continue;
    }
    if (line.startsWith("#")) continue; // comment line
    const parts = line.split("|").map((p) => p.trim());
    const [url, title, ...rest] = parts;
    if (!url) continue;
    ensureDefault().links.push({
      url,
      title: title || url,
      note: rest.length ? rest.join(" | ") : undefined,
    });
  }
  return sections;
}

/**
 * Resolves every link URL in `sections` against `baseUrl` when the link's
 * own URL has no scheme -- so a pasted sitemap of paths (or a directory
 * listing) can be turned into absolute links with one field, without
 * mutating URLs that are already absolute.
 * @param {{heading: string, links: {url: string}[]}[]} sections
 * @param {string} baseUrl
 */
export function resolveBaseUrl(sections, baseUrl) {
  const base = String(baseUrl ?? "").trim();
  if (!base) return sections;
  return sections.map((s) => ({
    ...s,
    links: s.links.map((l) => {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(l.url)) return l;
      const path = l.url.startsWith("/") ? l.url : `/${l.url}`;
      return { ...l, url: `${base.replace(/\/$/, "")}${path}` };
    }),
  }));
}

// --- extracting title/description from a Markdown file ------------------

/**
 * Pulls a link entry's title and description out of a Markdown file's own
 * content: the first "# Heading" as the title, and the first non-blank,
 * non-heading paragraph after it as the description. Deterministic and
 * source-derived -- no invented text.
 * @param {string} content
 * @returns {{title: string|null, description: string|null}}
 */
export function extractMarkdownSummary(content) {
  const lines = String(content ?? "").split(/\r?\n/);
  let title = null;
  let description = null;
  let sawTitle = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!sawTitle) {
      const m = line.match(/^#\s+(\S.*)$/);
      if (m) {
        title = m[1].trim();
        sawTitle = true;
      }
      continue;
    }
    if (!line || /^#{1,6}\s/.test(line) || line.startsWith(">")) continue;
    description = line.replace(/[*_`]/g, "").trim();
    break;
  }
  return { title, description };
}
