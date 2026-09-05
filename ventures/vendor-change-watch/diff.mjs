/**
 * Browser port of `src/vendor_watch/snapshot.py` and `src/vendor_watch/diff.py`.
 *
 * The status vocabulary is the CLI's and is load-bearing rather than cosmetic:
 * a snapshot that did not capture cleanly reads as `inconclusive`, and a pair
 * describing different pages reads as `unknown`. Neither may ever collapse to
 * "no change" — a failed or mismatched check that looks like stability is the
 * one defect this venture exists to avoid.
 *
 * Kept deliberately parallel to the Python so the two can be read side by side:
 * same heading-indexed sections, same whitespace normalisation, same three
 * change kinds, same limitation strings.
 */

export const FETCH_OK = "ok";
export const DEFAULT_HEADING = "(page)";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const SKIP_TAGS = new Set(["script", "style", "noscript"]);

/** Collapse whitespace so a reflow or re-indent isn't read as a content change. */
export function normalize(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

/**
 * True when the input looks like markup rather than the plain text a reader
 * would copy out of a page. Pasting rendered text is the common case here —
 * most people select-all a terms page in the browser rather than view-source —
 * so guessing wrong in either direction loses the section headings.
 */
export function looksLikeHtml(input) {
  return /<\s*(?:!doctype|html|head|body|div|p|h[1-6]|section|article|span|ul|ol|li|table)\b/i.test(
    String(input),
  );
}

function decodeEntities(text) {
  // The named set the CLI's `convert_charrefs=True` resolves in practice on
  // legal pages, plus numeric forms. A browser-side DOMParser would cover more,
  // but this module has to run identically under `node --test`, where there is
  // no DOM, so the substitution is done explicitly.
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
    hellip: "…",
    ldquo: "“",
    rdquo: "”",
    lsquo: "‘",
    rsquo: "’",
    copy: "©",
    reg: "®",
    trade: "™",
    sect: "§",
  };
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : whole;
    });
}

/**
 * Split markup into sections keyed by the nearest preceding heading — the same
 * shape `_SectionExtractor` produces, so a report built here and one built by
 * the CLI describe a page the same way.
 */
export function extractSectionsFromHtml(html) {
  const sections = new Map([[DEFAULT_HEADING, []]]);
  let currentHeading = DEFAULT_HEADING;
  let skipDepth = 0;
  let inHeading = false;
  let headingBuffer = [];

  const token = /<\/?\s*([a-z][a-z0-9]*)\b[^>]*?(\/?)>|([^<]+)/gi;
  let match;
  while ((match = token.exec(String(html))) !== null) {
    const [whole, tag, selfClosing, text] = match;

    if (text !== undefined) {
      if (skipDepth) continue;
      const decoded = decodeEntities(text);
      if (inHeading) {
        headingBuffer.push(decoded);
      } else if (decoded.trim()) {
        sections.get(currentHeading).push(decoded.trim());
      }
      continue;
    }

    const name = tag.toLowerCase();
    const closing = whole.startsWith("</");

    if (SKIP_TAGS.has(name)) {
      if (closing) skipDepth = Math.max(0, skipDepth - 1);
      else if (!selfClosing) skipDepth += 1;
      continue;
    }
    if (!HEADING_TAGS.has(name)) continue;

    if (closing) {
      if (!inHeading) continue;
      const heading = headingBuffer.join("").trim();
      inHeading = false;
      headingBuffer = [];
      if (heading) {
        currentHeading = heading;
        if (!sections.has(heading)) sections.set(heading, []);
      }
    } else {
      inHeading = true;
      headingBuffer = [];
    }
  }

  return [...sections.entries()]
    .map(([heading, parts]) => ({ heading, text: normalize(parts.join(" ")) }))
    .filter((section) => section.text);
}

/**
 * Split copied-and-pasted rendered text into the same section shape.
 *
 * Headings survive a copy out of a browser only as short standalone lines, so
 * that is what this recognises: a line with no sentence-ending punctuation,
 * short enough to be a title, with body text under it. Anything before the
 * first such line lands under `(page)`, exactly as the HTML path does.
 */
export function extractSectionsFromText(text) {
  const lines = String(text).split(/\r?\n/);
  const sections = new Map([[DEFAULT_HEADING, []]]);
  let currentHeading = DEFAULT_HEADING;

  /** Index of the next line with text on it, or -1. */
  const nextNonBlank = (from) => {
    for (let i = from; i < lines.length; i += 1) if (lines[i].trim()) return i;
    return -1;
  };

  const isHeading = (line, from) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 80) return false;
    if (/[.;:,]$/.test(trimmed)) return false;
    if (trimmed.split(/\s+/).length > 12) return false;
    // A heading stands alone as its own block: blank line before (checked by
    // the caller) and blank line after. Without the second half, the first
    // wrapped line of a paragraph gets promoted to a heading and takes the rest
    // of the paragraph with it as its "body".
    const standsAlone = from >= lines.length || !lines[from]?.trim();
    if (!standsAlone) return false;
    // A heading introduces something; a short line with nothing under it is
    // just a short line. Look past the blank gap for that body.
    return nextNonBlank(from) !== -1;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const previousBlank = i === 0 || !lines[i - 1].trim();
    if (previousBlank && isHeading(line, i + 1)) {
      currentHeading = line.trim();
      if (!sections.has(currentHeading)) sections.set(currentHeading, []);
      continue;
    }
    sections.get(currentHeading).push(line.trim());
  }

  return [...sections.entries()]
    .map(([heading, parts]) => ({ heading, text: normalize(parts.join(" ")) }))
    .filter((section) => section.text);
}

/** Pick the parser that matches what was actually pasted. */
export function extractSections(input) {
  return looksLikeHtml(input) ? extractSectionsFromHtml(input) : extractSectionsFromText(input);
}

/**
 * Build a snapshot in the shape `load_snapshot` validates, so a snapshot taken
 * in this page and one written by `vendor-watch check` are the same record.
 */
export function makeSnapshot({
  vendor,
  pageUrl,
  pageType,
  capturedAt,
  content,
  fetchStatus = FETCH_OK,
}) {
  return {
    vendor: String(vendor || "").trim(),
    page_url: String(pageUrl || "").trim(),
    page_type: String(pageType || "").trim(),
    captured_at: capturedAt || new Date().toISOString(),
    fetch_status: fetchStatus,
    sections: fetchStatus === FETCH_OK ? extractSections(content || "") : [],
  };
}

function indexSections(sections) {
  const map = new Map();
  for (const section of sections || []) map.set(section.heading, section.text);
  return map;
}

const IDENTITY_FIELDS = ["vendor", "page_url", "page_type"];

export const LIMITATIONS = [
  "This is a diff of one snapshot pair, not a legal review.",
  "No change reported here is not proof the page never changed between captures.",
  "This record is not legal advice and does not assert compliance or non-compliance.",
];

/** Section-level diff, or an inconclusive/unknown status. Mirrors `build_report`. */
export function buildReport(before, after) {
  const context = Object.fromEntries(IDENTITY_FIELDS.map((f) => [f, after[f]]));

  if (before.fetch_status !== FETCH_OK || after.fetch_status !== FETCH_OK) {
    const failedSide = before.fetch_status !== FETCH_OK ? "before" : "after";
    const failed = failedSide === "before" ? before : after;
    return {
      status: "inconclusive",
      reason: `${failedSide} snapshot fetch did not succeed (${failed.fetch_status})`,
      context,
    };
  }

  if (IDENTITY_FIELDS.some((field) => before[field] !== after[field])) {
    return { status: "unknown", reason: "snapshot contexts differ", context };
  }

  const old = indexSections(before.sections);
  const next = indexSections(after.sections);
  const headings = [...new Set([...old.keys(), ...next.keys()])].sort();

  const changes = [];
  for (const heading of headings) {
    if (!old.has(heading)) {
      changes.push({ heading, change: "added", after: next.get(heading) });
    } else if (!next.has(heading)) {
      changes.push({ heading, change: "removed", before: old.get(heading) });
    } else if (normalize(old.get(heading)) !== normalize(next.get(heading))) {
      changes.push({
        heading,
        change: "changed",
        before: old.get(heading),
        after: next.get(heading),
      });
    }
  }

  return {
    status: "observed",
    context,
    source_url: after.page_url,
    before_captured_at: before.captured_at,
    after_captured_at: after.captured_at,
    limitations: LIMITATIONS,
    changes,
  };
}

/**
 * Word-level diff of one section, so a reader sees the clause that moved rather
 * than two walls of near-identical prose. Plain LCS over whitespace tokens.
 */
export function wordDiff(before, after) {
  const a = normalize(before).split(" ").filter(Boolean);
  const b = normalize(after).split(" ").filter(Boolean);

  // Guard the quadratic table: legal sections are short, but a pasted whole
  // page under `(page)` is not, and a browser tab must not lock up on it.
  if (a.length * b.length > 4_000_000) {
    return [
      { kind: "removed", text: a.join(" ") },
      { kind: "added", text: b.join(" ") },
    ].filter((part) => part.text);
  }

  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const parts = [];
  const push = (kind, word) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += ` ${word}`;
    else parts.push({ kind, text: word });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push("removed", a[i]);
      i += 1;
    } else {
      push("added", b[j]);
      j += 1;
    }
  }
  while (i < a.length) push("removed", a[i++]);
  while (j < b.length) push("added", b[j++]);
  return parts;
}

/** One-line summary a reader can act on without reading the whole report. */
export function summarize(report) {
  if (report.status === "inconclusive") return `Inconclusive — ${report.reason}.`;
  if (report.status === "unknown") return `Not comparable — ${report.reason}.`;
  const n = report.changes.length;
  if (n === 0) return "No text changes between these two captures.";
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const change of report.changes) counts[change.change] += 1;
  const bits = [
    counts.changed ? `${counts.changed} section${counts.changed === 1 ? "" : "s"} changed` : "",
    counts.added ? `${counts.added} added` : "",
    counts.removed ? `${counts.removed} removed` : "",
  ].filter(Boolean);
  return `${bits.join(", ")}.`;
}

/** Markdown a practitioner can paste into a ticket, with the source on it. */
export function markdownReport(report) {
  const lines = [`# Vendor page change report`, ""];
  const ctx = report.context || {};
  lines.push(`- **Vendor:** ${ctx.vendor || "(unnamed)"}`);
  lines.push(`- **Page type:** ${ctx.page_type || "(unspecified)"}`);
  lines.push(`- **Source:** ${ctx.page_url || "(no URL recorded)"}`);
  lines.push(`- **Status:** ${report.status}`);

  if (report.status !== "observed") {
    lines.push("", `> ${report.reason}`, "");
    lines.push("_Not legal advice. This report does not assert compliance or non-compliance._");
    return `${lines.join("\n")}\n`;
  }

  lines.push(`- **Compared:** ${report.before_captured_at} → ${report.after_captured_at}`);
  lines.push("", `**${summarize(report)}**`, "");

  if (report.changes.length === 0) {
    lines.push("No section-level differences were found between these two captures.");
  }
  for (const change of report.changes) {
    lines.push(`## ${change.heading} — ${change.change}`, "");
    if (change.before) lines.push(`**Before:** ${change.before}`, "");
    if (change.after) lines.push(`**After:** ${change.after}`, "");
  }

  lines.push("---", "");
  for (const limitation of report.limitations || LIMITATIONS) lines.push(`- ${limitation}`);
  return `${lines.join("\n")}\n`;
}
