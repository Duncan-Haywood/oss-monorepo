// @ts-check
// Submittal register from a construction project manual (spec book).
//
// Input is the book's text as lines ({page, text, indent}), from a PDF's text
// layer (pdf-text.mjs) or from a text file (one page per form feed). Output is
// one row per submittal requirement found in each section's Part 1 submittal
// articles, typed on one scale (the UFGS SD-01..SD-11 descriptions, which
// most owners' Division 01 sections define or echo) and phased (action,
// informational, closeout).
//
// Two layouts are read:
//   - CSI SectionFormat / MasterFormat books ("1.3 ACTION SUBMITTALS" then
//     "A. Product Data: For each type of product." paragraphs), the layout of
//     most commercial and public-agency project manuals;
//   - UFGS books ("1.3 SUBMITTALS" then "SD-03 Product Data" headings with
//     one item per line and "; G" for items needing Government approval).
// Pure functions; no DOM, no network.

/** @typedef {{page: number, text: string, indent: number, file?: string, filePage?: number}} Line */
/** @typedef {{id: string, section: string, sectionTitle: string, article: string, para: string, label: string, type: string, sd: string, phase: string, description: string, approval: string, reviewer: string, flags: string[], page: number, file?: string, filePage?: number}} Item */

// ---------------------------------------------------------------- input

/** Text with form feeds between pages (pdftotext's output, or pasted text). */
export function linesFromText(text) {
  /** @type {Line[]} */
  const out = [];
  String(text ?? "").replace(/\r\n?/g, "\n").split("\f").forEach((pg, i) => {
    for (const raw of pg.split("\n")) {
      const t = raw.replace(/\t/g, "    ").replace(/ /g, " ");
      out.push({ page: i + 1, text: t.trim(), indent: t.length - t.trimStart().length });
    }
  });
  return out;
}

/**
 * Lines from extractPdfLines(): items on a line joined with one space (two
 * when the gap is wide), indent = the first item's x in points / 6, so it
 * reads on roughly the same scale as a character count.
 */
export function linesFromPdf(pages) {
  /** @type {Line[]} */
  const out = [];
  pages.forEach((p, i) => {
    let minX = Infinity;
    for (const l of p.lines) if (l.items.length) minX = Math.min(minX, l.items[0].x);
    for (const l of p.lines) {
      let s = "";
      let end = null;
      for (const it of l.items) {
        if (end !== null) {
          const gap = it.x - end;
          if (gap > 1.2 && !s.endsWith(" ") && !it.text.startsWith(" ")) s += gap > 18 ? "  " : " ";
        }
        s += it.text;
        end = it.xEnd;
      }
      const x = l.items.length ? l.items[0].x : 0;
      out.push({ page: i + 1, text: s.replace(/\s+$/, "").replace(/^\s+/, ""), indent: Math.max(0, Math.round((x - (isFinite(minX) ? minX : 0)) / 6)) });
    }
    out.push({ page: i + 1, text: "", indent: 0 });
  });
  return out;
}

// ------------------------------------------------------- running lines

const shape = (t) => t.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
const PAGE_FOOTER = /^(?:page\s+#(?:\s+of\s+#)?|#|#\s*[-–]\s*#|(?:section\s+)?#\s?#\s?#(?:\.#)?(?:\s#)?\s*[-–]\s*#|(?:section\s+)?#\s?#\s?#(?:\.#)?(?:\s#)?\s+page\s+#(?:\s+of\s+#)?)$/;

/**
 * Drop running headers and footers: a line whose shape (digits as #) sits in
 * the top or bottom four lines of at least a fifth of the pages (and at least
 * three), plus bare page-number footers anywhere.
 */
export function stripRunningLines(lines) {
  const pages = new Map();
  for (const l of lines) if (l.text) { if (!pages.has(l.page)) pages.set(l.page, []); pages.get(l.page).push(l); }
  const count = new Map();
  for (const ls of pages.values()) {
    const seen = new Set();
    for (const l of [...ls.slice(0, 4), ...ls.slice(-4)]) {
      const s = shape(l.text);
      if (!seen.has(s)) { seen.add(s); count.set(s, (count.get(s) || 0) + 1); }
    }
  }
  const need = Math.max(3, Math.ceil(pages.size / 5));
  const running = new Set([...count].filter(([s, n]) => n >= need && !/^(part #|end of section)/.test(s)).map(([s]) => s));
  return lines.filter((l) => {
    if (!l.text) return true;
    const s = shape(l.text);
    if (PAGE_FOOTER.test(s)) return false;
    if (!running.has(s)) return true;
    // A running line that is also a section heading ("SECTION 09 91 23" as a
    // page header) keeps its first copy per section, so the start is seen.
    return false;
  });
}

// ------------------------------------------------------------ sections

const NUM = String.raw`(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{2}))?(?:\s(\d{2}))?`;
const SECTION_START = new RegExp(String.raw`^(?:SECTION|DOCUMENT)\s+${NUM}\b\s*(?:[-–—:.]\s*)?(.*)$`);
const END_SECTION = /^END\s+OF\s+SECTION\b/i;

/** "099123" or "09 91 23" -> "09 91 23"; keeps ".13" and a UFGS " 20" suffix. */
export function normalizeNumber(m) {
  return `${m[1]} ${m[2]} ${m[3]}${m[4] ? "." + m[4] : ""}${m[5] ? " " + m[5] : ""}`;
}

const upperShare = (t) => {
  const letters = t.replace(/[^A-Za-z]/g, "");
  return letters ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
};

/**
 * Split the book into sections at "SECTION 09 91 23 - TITLE" lines. A number
 * seen more than once (a table of contents, a page header) keeps the copy
 * with the most body; "SECTION nn nn nn Page 4" footers are not starts.
 */
export function findSections(lines) {
  const starts = [];
  lines.forEach((l, i) => {
    const m = l.text.match(SECTION_START);
    if (!m) return;
    const rest = m[6].trim();
    if (/^page\b/i.test(rest) || /^[-–]\s*\d+$/.test(rest) || /^\d+$/.test(rest)) return;
    // A cross-reference that wrapped onto a new line ("... see" / "SECTION 07 27 26
    // FLUID-APPLIED MEMBRANE AIR BARRIERS, and other ...") is not a heading.
    if (/[,;]$|\b(and|or|of|the|with|in|to)$/i.test(rest)) return;
    let p = i - 1;
    while (p >= 0 && !lines[p].text) p--;
    if (p >= 0 && lines[p].page === l.page && lines[p].text.length > 40 && /[a-z,;]$/.test(lines[p].text)) return;
    starts.push({ i, number: normalizeNumber(m), title: rest });
  });
  const found = [];
  starts.forEach((s, k) => {
    const stop = k + 1 < starts.length ? starts[k + 1].i : lines.length;
    let end = stop;
    for (let j = s.i + 1; j < stop; j++) if (END_SECTION.test(lines[j].text)) { end = j; break; }
    const body = lines.slice(s.i + 1, end);
    let title = s.title;
    let skip = 0;
    if (!title) {
      for (let j = 0; j < Math.min(body.length, 6); j++) {
        const t = body[j].text;
        if (!t) continue;
        if (/^PART\s+\d/i.test(t) || /^\d+\.\d+\b/.test(t)) break;
        if (upperShare(t) > 0.7 && t.length < 90) { title = t; skip = j + 1; }
        break;
      }
    }
    found.push({ number: s.number, title: title.replace(/\s+/g, " ").trim(), page: lines[s.i].page, body: body.slice(skip) });
  });
  const best = new Map();
  for (const s of found) {
    const prev = best.get(s.number);
    const weight = (x) => x.body.filter((l) => l.text).length;
    if (!prev || weight(s) > weight(prev)) best.set(s.number, prev && !s.title ? { ...s, title: prev.title } : s);
  }
  return found.filter((s) => best.get(s.number) === s);
}

// ------------------------------------------------------------ articles

const ARTICLE = /^(\d{1,2}\.\d{1,2})\s+(.+)$/;
const ARTICLE_NUMBER_ONLY = /^(\d{1,2}\.\d{1,2})$/;
const PART = /^PART\s*(\d)\b/i;
const NOT_A_LIST = /\b(PROCEDURES?|ADMINISTRATIVE|FORMATS?|PREPARATION|REVIEW|APPROVED|DISAPPROVED|FORWARDING|QUANTITY|DEVELOPMENT|RELATIONSHIP|CLASSIFICATION|SCHEDULING|SCHEDULE|IDENTIFICATION|DISTRIBUTION|TRANSMITTAL|RESUBMITTALS?|ELECTRONIC|TIMING|PHASES|REQUIREMENTS?|OF)\b/;

/** Is an article heading a list of submittals ("ACTION SUBMITTALS", "SUBMITTALS")? */
export function isSubmittalHeading(title) {
  const t = title.toUpperCase().replace(/[^A-Z\s&-]/g, " ").replace(/\s+/g, " ").trim();
  if (!/\bSUBMITTALS?\b/.test(t)) return false;
  if (NOT_A_LIST.test(t)) return false;
  return t.split(" ").length <= 5;
}

/** Articles of a section body: {number, title, part, lines}. */
export function findArticles(body) {
  const arts = [];
  let part = 0;
  let cur = null;
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    const p = l.text.match(PART);
    if (p && l.text.length < 60) { part = Number(p[1]); cur = null; continue; }
    let m = l.text.match(ARTICLE);
    let title = m ? m[2].trim() : "";
    if (!m) {
      const n = l.text.match(ARTICLE_NUMBER_ONLY);
      if (n) {
        let j = i + 1;
        while (j < body.length && !body[j].text) j++;
        if (j < body.length && upperShare(body[j].text) > 0.8 && body[j].text.length < 80) { m = n; title = body[j].text; i = j; }
      }
    }
    if (m && upperShare(title) > 0.8 && title.length < 80 && !/^\d/.test(title)) {
      cur = { number: m[1], title: title.replace(/\s+/g, " "), part: part || Number(m[1].split(".")[0]), lines: [] };
      arts.push(cur);
      continue;
    }
    if (cur) cur.lines.push(l);
  }
  return arts;
}

// --------------------------------------------------------------- types

export const SD = {
  "SD-01": "Preconstruction Submittals",
  "SD-02": "Shop Drawings",
  "SD-03": "Product Data",
  "SD-04": "Samples",
  "SD-05": "Design Data",
  "SD-06": "Test Reports",
  "SD-07": "Certificates",
  "SD-08": "Manufacturer's Instructions",
  "SD-09": "Manufacturer's Field Reports",
  "SD-10": "Operation and Maintenance Data",
  "SD-11": "Closeout Submittals",
};

// First match wins; checked against the paragraph's label, then its text.
/** @type {[RegExp, string][]} */
const TYPE_RULES = [
  [/\b(maintenance materials?|extra (stock|materials?)|attic stock|spare parts)\b/i, "SD-11"],
  [/\b(operation|operating|maintenance)( and maintenance)? (data|manuals?|instructions)\b|\bO\s?&\s?M\b/i, "SD-10"],
  [/\bwarrant(y|ies)\b|\brecord (drawings|documents)\b|\bas-?built\b|\bcloseout\b/i, "SD-11"],
  [/\bmanufacturer'?s?'? field\b|\bfield service reports?\b/i, "SD-09"],
  [/\b(installation|manufacturer'?s?'?) instructions\b/i, "SD-08"],
  [/\bsamples?\b/i, "SD-04"],
  [/\bproduct (data|lists?)\b|\bproduct literature\b|\bcatalog (cuts|data)\b|\bdata sheets?\b/i, "SD-03"],
  [/\b(shop|coordination|erection|setting|layout|fabrication) drawings?\b|\bwiring diagrams?\b|\b(product|door hardware|hardware|finish|equipment|fixture) schedules?\b|\bschedules?\b(?! of values)/i, "SD-02"],
  [/\bdelegated[- ]design\b|\bdesign (data|calculations?|submittal)\b|\bcalculations?\b|\bmix designs?\b/i, "SD-05"],
  [/\b(test|inspection|evaluation|research|quality[- ]control|commissioning) reports?\b|\btest (data|results)\b|\bfield quality[- ]control\b/i, "SD-06"],
  [/\bcertific(ate|ates|ation|ations)\b|\bqualification(s| data| statements?)?\b|\bletters? of (compliance|assurance)\b|\bstatements? of compliance\b/i, "SD-07"],
  [/\b(plans?|programs?|permits?|bonds?|insurance|submittal register|work schedule|progress schedule)\b/i, "SD-01"],
];

/** SD code for a label (and fallback text), or "" when nothing fits. */
export function classify(label, text = "") {
  for (const src of [label, text]) {
    if (!src) continue;
    for (const [re, sd] of TYPE_RULES) if (re.test(src)) return sd;
  }
  return "";
}

const PHASE_OF_SD = { "SD-01": "Informational", "SD-02": "Action", "SD-03": "Action", "SD-04": "Action", "SD-05": "Action", "SD-06": "Informational", "SD-07": "Informational", "SD-08": "Informational", "SD-09": "Informational", "SD-10": "Closeout", "SD-11": "Closeout" };

function phaseOf(articleTitle, sd) {
  const t = articleTitle.toUpperCase();
  if (/\bACTION\b/.test(t)) return "Action";
  if (/\bINFORMATION(AL)?\b/.test(t)) return "Informational";
  if (/\bCLOSEOUT\b|\bMAINTENANCE MATERIAL\b|\bFINAL\b/.test(t)) return "Closeout";
  return PHASE_OF_SD[sd] || "";
}

// ------------------------------------------------------------- items

const clean = (t) => t.replace(/[[\]]/g, "").replace(/_{3,}/g, "____").replace(/\s+/g, " ").replace(/\s+([;,.:])/g, "$1").trim();
const SD_HEAD = /^SD-?\s?(\d{2})\b\s*(.*)$/i;
const G_TAIL = /;\s*G\b(?:\s*,\s*(?:([A-Z][A-Z/&-]{0,7})\b|_+))?\s*/;

/** UFGS list: "SD-03 Product Data" then one item per line, "; G" flagged. */
function parseSdList(lines) {
  const items = [];
  let sd = "";
  /** @type {any} */
  let prev = null;
  for (const l of lines) {
    const t = l.text;
    if (!t) { prev = prev && { ...prev, gap: true }; continue; }
    const h = t.match(SD_HEAD);
    if (h) { sd = `SD-${h[1]}`; prev = null; continue; }
    // A numbered sub-article ("1.4.1 Preconstruction Submittals") or a lettered
    // paragraph ends the list: what follows is prose, not items.
    if (/^\d+\.\d+(\.\d+)*\s/.test(t) || /^[a-z]\.\s/.test(t)) { sd = ""; prev = null; continue; }
    if (!sd) continue; // the lead-in paragraph before the first SD heading
    const cont = prev && !prev.gap && (/^[a-z(]/.test(t) || /(,|\band|\bor|\bof|\bfor|\bwith|\bto|-|\/)$/i.test(prev.item.raw) || l.indent > prev.indent + 2);
    if (cont) { prev.item.raw += " " + t; continue; }
    const item = { raw: t, sd, page: l.page };
    items.push(item);
    prev = { item, indent: l.indent, gap: false };
  }
  return items.map((it) => {
    const g = it.raw.match(G_TAIL);
    const flags = [];
    if (/\(\s*LEED[^)]*\)|\bLEED\b/i.test(it.raw)) flags.push("sustainability");
    const label = clean(it.raw.replace(G_TAIL, " ").replace(/\(\s*LEED[^)]*\)/gi, "").replace(/;\s*$/, ""));
    return { label, description: label, sd: it.sd, approval: g ? "G" : "", reviewer: g && g[1] ? g[1] : "", flags, page: it.page, para: "" };
  }).filter((it) => it.label && !/^(government approval|the following)/i.test(it.label));
}

const P1 = /^([A-Z])\.\s+(.*)$/;
const P2 = /^(\d{1,2})\.\s+(.*)$/;
const P3 = /^([a-z])\.\s+(.*)$/;
const P4 = /^\(([a-z0-9]{1,3})\)\s+(.*)$/;

/** A paragraph tree from SectionFormat markers (A., 1., a., (1)). */
function paragraphTree(lines) {
  const root = { level: 0, mark: "", text: "", page: 0, kids: [] };
  const stack = [root];
  let last = null;
  for (const l of lines) {
    const t = l.text;
    if (!t) continue;
    let m = null, level = 0;
    for (const [re, lv] of /** @type {[RegExp, number][]} */ ([[P1, 1], [P2, 2], [P3, 3], [P4, 4]])) { m = t.match(re); if (m) { level = lv; break; } }
    // "1." under no "A." paragraph is still a paragraph; "a." under "A." only after a "1.".
    if (m) {
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
      const node = { level, mark: m[1], text: m[2], page: l.page, kids: [] };
      stack[stack.length - 1].kids.push(node);
      stack.push(node);
      last = node;
    } else if (last) last.text += " " + t;
    else root.text += (root.text ? " " : "") + t;
  }
  return root;
}

const LABEL = /^([A-Z][^:.;]{1,70}?)\s*:\s*(.*)$/;

function splitLabel(text) {
  const m = text.match(LABEL);
  if (m && m[1].split(/\s+/).length <= 9) return { label: m[1].trim(), rest: m[2].trim() };
  return { label: "", rest: text };
}

const subText = (n) => n.kids.map((k) => `${k.mark}. ${clean(k.text)}${k.kids.length ? " " + subText(k) : ""}`).join(" ");

/** SectionFormat list: each "A." paragraph is a submittal, unless it is only a lead-in. */
function parseLettered(lines) {
  const root = paragraphTree(lines);
  const out = [];
  const emit = (node, para, inheritedLabel = "") => {
    const text = clean(node.text);
    const { label, rest } = splitLabel(text);
    const lab = label || inheritedLabel;
    out.push({ label: lab, description: clean([lab && !label ? lab + ":" : "", text, node.kids.length ? subText(node) : ""].filter(Boolean).join(" ")), sd: "", approval: "", reviewer: "", flags: [], page: node.page, para, rest });
  };
  const visit = (nodes, prefix) => {
    for (const n of nodes) {
      const text = clean(n.text);
      const { label } = splitLabel(text);
      const leadIn = n.kids.length > 0 && !classify("", text) && (/^(submit|provide|furnish)\b.*:$/i.test(text) || (!classify(label) && text.endsWith(":") && !label) || /^the following\b/i.test(text));
      const para = prefix ? `${prefix}.${n.mark}` : n.mark;
      if (leadIn) visit(n.kids, para);
      else if (label && !classify(label) && n.kids.length && n.kids.every((k) => classify(splitLabel(clean(k.text)).label))) visit(n.kids, para);
      else emit(n, para);
    }
  };
  visit(root.kids.length ? root.kids : [], "");
  // No markers at all: one requirement per "Label: text" line.
  if (!out.length) {
    for (const l of lines) {
      const { label, rest } = splitLabel(clean(l.text));
      if (label && classify(label)) out.push({ label, description: clean(l.text), sd: "", approval: "", reviewer: "", flags: [], page: l.page, para: "", rest });
    }
  }
  return out.filter((it) => it.description && !/^not used\.?$/i.test(it.description));
}

/** First sentence of a paragraph, cut at a word near 70 characters. */
function shortTitle(text) {
  const first = String(text || "").split(/(?<=[a-z0-9)])\.\s/)[0].replace(/[.:]$/, "");
  if (first.length <= 70) return first;
  return first.slice(0, 70).replace(/\s+\S*$/, "") + "...";
}

/** Submittal rows for one section. */
export function sectionItems(section) {
  /** @type {Item[]} */
  const items = [];
  for (const a of findArticles(section.body)) {
    if (a.part > 1 || !isSubmittalHeading(a.title)) continue;
    const ufgs = a.lines.some((l) => SD_HEAD.test(l.text));
    const rows = ufgs ? parseSdList(a.lines) : parseLettered(a.lines);
    for (const r of rows) {
      const sd = r.sd || classify(r.label, r.description);
      const flags = [...r.flags];
      if (/\b(LEED|sustainab\w+|recycled content|regional materials|VOC|EPD|environmental product declaration)\b/i.test(r.description)) if (!flags.includes("sustainability")) flags.push("sustainability");
      if (/\bdelegated[- ]design\b|\b(signed and |)sealed by\b|\bsigned and sealed\b|\bP\.E\.-sealed\b/i.test(r.description)) flags.push("engineer-sealed");
      if (/\bif (requested|required|applicable)\b|\bupon request\b|\bwhen (requested|required)\b/i.test(r.description)) flags.push("conditional");
      items.push({
        id: "",
        section: section.number,
        sectionTitle: section.title,
        article: `${a.number} ${a.title}`,
        para: r.para,
        label: r.label || shortTitle(r.description) || (sd ? SD[sd] : ""),
        type: sd ? SD[sd] : "Other",
        sd,
        phase: phaseOf(a.title, sd),
        description: r.description,
        approval: r.approval,
        reviewer: r.reviewer,
        flags,
        page: r.page,
      });
    }
  }
  items.forEach((it, i) => { it.id = `${it.section.replace(/\s/g, "")}-${String(i + 1).padStart(3, "0")}`; });
  return items;
}

/**
 * The whole register.
 * @param {Line[]} lines
 */
export function buildRegister(lines) {
  const body = stripRunningLines(lines);
  const sections = findSections(body);
  const out = [];
  const warnings = [];
  for (const s of sections) {
    const items = sectionItems(s);
    const hasPart1 = s.body.some((l) => PART.test(l.text));
    out.push({ number: s.number, title: s.title, page: s.page, count: items.length, hasPart1, items });
  }
  if (!sections.length) warnings.push("No \"SECTION nn nn nn\" headings found. Is this a CSI-format project manual with a text layer?");
  const noItems = out.filter((s) => s.hasPart1 && !s.count && !/^0[01]/.test(s.number));
  if (noItems.length) warnings.push(`${noItems.length} section(s) with a Part 1 but no submittal list found: ${noItems.slice(0, 12).map((s) => s.number).join(", ")}${noItems.length > 12 ? ", ..." : ""}. Check them by hand.`);
  const items = out.flatMap((s) => s.items);
  // Several files read as one book: say which file and page each row came from.
  const where = new Map();
  for (const l of lines) if (l.file && !where.has(l.page)) where.set(l.page, { file: l.file, page: l.filePage ?? l.page });
  for (const it of items) { const w = where.get(it.page); it.file = w ? w.file : ""; it.filePage = w ? w.page : it.page; }
  return { sections: out, items, warnings, summary: summarize(items) };
}

export function summarize(items) {
  const byType = {}, byPhase = {};
  for (const it of items) {
    byType[it.type] = (byType[it.type] || 0) + 1;
    if (it.phase) byPhase[it.phase] = (byPhase[it.phase] || 0) + 1;
  }
  return { total: items.length, sections: new Set(items.map((i) => i.section)).size, byType, byPhase, approval: items.filter((i) => i.approval).length };
}

// ------------------------------------------------------------- output

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // formula injection guard; plain numbers pass
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_COLUMNS = ["Submittal No.", "Spec Section", "Section Title", "Article", "Paragraph", "Submittal Type", "SD", "Phase", "Title", "Description", "Approval", "Reviewer", "Flags", "File", "Page", "Status", "Date Required", "Date Submitted", "Date Returned", "Action"];

/** CSV a spreadsheet or a project-management tool's import can take; status columns left blank to fill. */
export function toCsv(register) {
  const rows = [CSV_COLUMNS];
  for (const it of register.items) {
    rows.push([it.id, it.section, it.sectionTitle, it.article, it.para, it.type, it.sd, it.phase, it.label, it.description, it.approval, it.reviewer, it.flags.join(" "), it.file || "", it.filePage ?? it.page, "", "", "", "", ""]);
  }
  return "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Plain-text summary for the CLI. */
export function report(register) {
  const s = register.summary;
  const lines = [`${s.total} submittals in ${s.sections} of ${register.sections.length} sections`];
  lines.push("By type: " + Object.entries(s.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
  if (Object.keys(s.byPhase).length) lines.push("By phase: " + Object.entries(s.byPhase).map(([k, v]) => `${k} ${v}`).join(", "));
  if (s.approval) lines.push(`Marked for Government approval (G): ${s.approval}`);
  for (const w of register.warnings) lines.push("Note: " + w);
  return lines.join("\n");
}
