// A submittal register read from the project manual (submittals, part 3): the shop drawings,
// product data, samples and close-out documents each specification section asks for, proposed as
// rows for the job's submittal log so nobody types them from the spec book. Pure and deterministic:
// no model reads the spec, and every row proposed carries the paragraph it was read from, so the
// person checks it against the spec before adding it. Nothing here is saved; the page sends the rows
// the person keeps.
//
// How the text is read (CSI MasterFormat numbering, the SectionFormat layout most US spec books use):
// - Sections: a line "SECTION 09 29 00 - GYPSUM BOARD" (or "SECTION 092900", "SECTION 09250", the
//   title on the line after) opens a section, until "END OF SECTION" or the next one. Division 01
//   sections set the submittal procedures for the whole job, not one trade's items, so their
//   paragraphs are left out and said so.
// - Articles: a numbered heading ("1.3 ACTION SUBMITTALS", "1.03 SUBMITTALS", "1.4 Informational
//   Submittals") whose title names submittals opens a submittal article, until the next article
//   heading or "PART 2". Its kind (action, informational, close-out, maintenance material,
//   sustainable design) comes from the heading.
// - Items: each lettered paragraph ("A. Product Data: For each type of product.") in a submittal
//   article is one item, with its numbered sub-paragraphs and wrapped lines. The words before the
//   colon name it and pick its type (warranty before samples, so "Sample Warranty" is a warranty).
//   A paragraph with no such name is an item only when it says what to submit ("Submit shop
//   drawings showing ...", "Furnish extra materials ..."); a procedure ("Comply with Section
//   01 33 00", "General: ...") is listed as skipped, with why.
// - Page headers and footers: a line that sits in the first or last three lines of three or more
//   pages (digits ignored, so "GYPSUM BOARD 09 29 00 - 3" matches "- 4") is dropped, as are bare
//   page numbers and "section - page" footers in pasted text.
// What the text does not say is not guessed: no dates, review periods or lead times are proposed.
import { linesFromPdfText } from "./insurance-exhibit";
import { PdfUnreadable } from "./pdf/reader";
import { extractText, type PdfText } from "./pdf/text";
import { MAX_SUBMITTALS_PER_JOB, type SubmittalType } from "./submittals";

export const SPEC_GROUPS = [
  "action",
  "informational",
  "closeout",
  "maintenance",
  "sustainable",
  "submittals",
] as const;
export type SpecGroup = (typeof SPEC_GROUPS)[number];

export const SPEC_GROUP_LABELS: Record<SpecGroup, string> = {
  action: "Action submittals",
  informational: "Informational submittals",
  closeout: "Close-out submittals",
  maintenance: "Maintenance material submittals",
  sustainable: "Sustainable design submittals",
  submittals: "Submittals",
};

/** One item a section asks for, as a row for the log. */
export interface SpecSubmittal {
  /** "09 29 00", or null when the text named no section. */
  specSection: string | null;
  /** The section's title as printed in title case ("Gypsum Board"); "" when none. */
  sectionTitle: string;
  group: SpecGroup;
  /** The paragraph's own name for it ("Product Data"). */
  label: string;
  /** The log's "What": "Gypsum Board: Product Data" (at most 200 characters). */
  title: string;
  type: SubmittalType;
  /** The paragraph as read, with its sub-paragraphs (at most `MAX_SPEC_PARAGRAPH` characters). */
  text: string;
  /** The page its first line is on (null for pasted text). */
  page: number | null;
}

export interface SpecSkipped {
  specSection: string | null;
  text: string;
  why: string;
  page: number | null;
}

export interface SpecReading {
  /** Every section read, in order, with the number of items found in it. */
  sections: { specSection: string; title: string; items: number }[];
  items: SpecSubmittal[];
  /** Paragraphs in a submittal article that were not taken as items. */
  skipped: SpecSkipped[];
  notes: string[];
  /** Division 01 sections met (their paragraphs are not read as items). */
  division01: string[];
}

/** One line of the spec's text and the page it is on (null for pasted text). */
export interface SpecLine {
  text: string;
  page: number | null;
}

/** Pasted text: a few divisions of a project manual. */
export const MAX_SPEC_CHARS = 2_000_000;
/** Pages read from a spec PDF: a trade's divisions, not always the whole book. */
export const MAX_SPEC_PAGES = 400;
/** Rows proposed from one reading: as many as a job's log holds. */
export const MAX_SPEC_ITEMS = MAX_SUBMITTALS_PER_JOB;
export const MAX_SPEC_PARAGRAPH = 1_500;
const MAX_TITLE = 200;

const norm = (s: string) =>
  s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A guide spec's brackets and blanks ("[ Trim", "][; G, [_____] ]") read as the edited text would. */
const unbracket = (s: string) =>
  /[[\]]/.test(s)
    ? s
        .replace(/\[_{3,}\]/g, "")
        .replace(/[[\]]/g, " ")
        .replace(/\s+;/g, ";")
        .replace(/[;,]\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : s;

const SECTION =
  /^SECTION\s+(\d{2}\s?\d{2}\s?\d{2}(?:\.\d{1,2}(?:\s\d{2}(?=\s|$))?)?|\d{5}(?:\.\d{1,2})?)\b\s*[-:.]?\s*(.*)$/;
const END_SECTION = /^END\s+OF\s+SECTION\b/i;
const PART = /^PART\s+(\d)\b(?:\s*[-:.]?\s*[A-Z ,&]*)?$/;
const ARTICLE = /^(\d{1,2}(?:\.\d{1,2}){1,3})\s+(.+)$/;
const TOP = /^([A-Z])\.\s+(.*)$/;
const PAGE_NUMBER = /^(?:page\s+)?\d{1,4}(?:\s+of\s+\d{1,4})?$/i;
const SECTION_FOOTER =
  /\b\d{2}\s?\d{2}\s?\d{2}(?:\.\d{1,2})?\s*-\s*\d{1,3}$|^SECTION\s+[\d .]+\s+Page\s+\d{1,4}(?:\s+of\s+\d{1,4})?$/i;
/** A row of asterisks opens or closes an editor's note in a guide spec (UFGS): never project text. */
const NOTE_RULE = /^\*{10,}$/;
/** "SD-02 Shop Drawings": a UFGS submittal description, with its items one to a line below it. */
const SD_HEADING = /^SD-(\d{2})\b[\s,.:-]*(.*)$/;
/** A UFGS item's approval code: "; G", "; G, AE", "; S". */
const DESIGNATION = /\s*;\s*([GS](?:\s*,\s*[A-Z]{1,3})?)\s*$/;

/** The type each UFGS submittal description stands for; null where the item's own name decides. */
const SD_TYPES: Record<string, SubmittalType | null> = {
  "01": null,
  "02": "shop_drawings",
  "03": "product_data",
  "04": "samples",
  "05": null,
  "06": "test_report",
  "07": "certificate",
  "08": null,
  "09": "test_report",
  "10": "o_and_m",
  "11": null,
};

const hasLower = (s: string) => /[a-z]/.test(s);

/** "092900" and "09 29 00" read the same: "09 29 00". Five-digit (1995) numbers stay as they are. */
export function specSectionNumber(raw: string): string {
  // A UFGS agency suffix ("02 62 13.00 10") keeps its space.
  const [main = "", suffix] = raw.trim().split(/(?<=\.\d{1,2})\s+/);
  const s = main.replace(/\s+/g, "");
  const m = /^(\d{2})(\d{2})(\d{2})(\.\d{1,2})?$/.exec(s);
  const n = m ? `${m[1]} ${m[2]} ${m[3]}${m[4] ?? ""}` : s;
  return suffix ? `${n} ${suffix}` : n;
}

const SMALL = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);
const KEEP_UPPER = /^(?:[A-Z]{1,3}\d*|HVAC|PVC|CMU|EIFS|LED|ADA|MEP|GFRC|FRP|TPO|EPDM|PVDF)$/;

/** "GYPSUM BOARD ASSEMBLIES" reads "Gypsum Board Assemblies"; titles already in mixed case stay. */
export function titleCase(s: string): string {
  if (hasLower(s)) return s;
  return s
    .split(" ")
    .map((w, i) => {
      if (
        KEEP_UPPER.test(w) &&
        w.length <= 4 &&
        !/^(?:AND|FOR|THE|OF|TO|IN|ON|OR|AT|BY|A|AN)$/.test(w)
      )
        return w;
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.replace(/(^|[-/(])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
    })
    .join(" ");
}

function groupOf(heading: string): SpecGroup {
  if (/\baction\b/i.test(heading)) return "action";
  if (/\binformation(?:al)?\b/i.test(heading)) return "informational";
  if (/\bclose[-\s]?out\b|\bproject\s+record\b/i.test(heading)) return "closeout";
  if (/\bmaintenance\s+materials?\b|\bextra\s+(?:stock\s+)?materials?\b/i.test(heading))
    return "maintenance";
  if (/\bsustainab|\bLEED\b|\bgreen\s+building\b/i.test(heading)) return "sustainable";
  return "submittals";
}

/** Warranty before samples ("Sample Warranty"), test reports before certificates ("Certified test reports"). */
const TYPE_RULES: [SubmittalType, RegExp][] = [
  ["warranty", /\bwarrant(?:y|ies)\b|\bguarantees?\b/i],
  [
    "o_and_m",
    /\b(?:operation|operating|maintenance)\s+(?:and\s+maintenance\s+)?(?:data|manuals?|instructions)\b|\bO\s?&\s?M\b/i,
  ],
  ["mock_up", /\bmock[-\s]?ups?\b/i],
  ["samples", /\bsamples?\b/i],
  [
    "shop_drawings",
    /\b(?:shop|coordination|layout|erection|fabrication|setting|installation|placement|placing|framing)\s+drawings?\b|\bdelegated[-\s]design\b|\bdrawings?\b|\bdetailing\b/i,
  ],
  [
    "product_data",
    /\bproduct\s+(?:data|schedules?|literature|information)\b|\bdata\s+sheets?\b|\bmanufacturer'?s?\s+(?:data|literature|product)\b|\bcut\s+sheets?\b/i,
  ],
  [
    "test_report",
    /\breports?\b|\btests?\b|\btesting\b|\binspections?\b|\bevaluations?\b|\banalys[ie]s\b/i,
  ],
  ["certificate", /\bcertificat(?:e|es|ion|ions)\b|\bcertified\b|\baffidavits?\b/i],
];

export function specSubmittalType(label: string): SubmittalType {
  for (const [type, re] of TYPE_RULES) if (re.test(label)) return type;
  return "other";
}

// Labels that name a procedure, not something to send.
const PROCEDURAL_LABEL =
  /^(?:general|submittals?|submittal\s+(?:procedures?|requirements?|schedule|format)|procedures?|requirements?|format|preparation|copies|quantity|number\s+of\s+(?:copies|sets)|electronic\s+submittals?|coordination|submit(?:\s+the\s+following)?|scheduling|timing|review|resubmittals?|action\s+submittals?|informational\s+submittals?)$/i;
const PROCEDURE_START =
  /^(?:comply|refer|see|section\b|submit\s+(?:submittals|in\s+accordance|under|as\s+specified|the\s+following)|submittals?\s+(?:shall|are|must)|provide\s+submittals|prepare|coordinate|do\s+not|unless|where|the\s+contractor|contractor\s+shall)/i;
// "Submit shop drawings showing ...", "Submit manufacturer's product data ...".
const SUBMIT_WHAT =
  /^(?:submit|provide|furnish)\s+(?:(?:two|three|four|\d+)\s+(?:copies|sets)\s+of\s+)?(?:the\s+)?(?:manufacturer'?s?\s+)?(shop\s+drawings|product\s+data|samples?|(?:color\s+)?samples?|mock[-\s]?ups?|test\s+reports?|certificates?|warrant(?:y|ies)|(?:operation\s+and\s+)?maintenance\s+(?:data|manuals?)|coordination\s+drawings|calculations|extra\s+(?:stock\s+)?materials?|record\s+drawings|qualification\s+data)\b/i;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The paragraph's name for itself, or why it is not an item. */
function labelOf(text: string): { label: string } | { why: string } {
  const colon = /^([^:]{2,80}?):\s*(.*)$/.exec(text);
  if (colon?.[1]) {
    const label = colon[1].trim();
    const words = label.split(/\s+/).length;
    if (
      words <= 9 &&
      /^[A-Z"']/.test(label) &&
      !/[.;]/.test(label.replace(/\b[A-Z]\.(?=[A-Z])/g, ""))
    ) {
      if (PROCEDURAL_LABEL.test(label)) return { why: "a procedure, not an item to send" };
      return { label };
    }
  }
  const what = SUBMIT_WHAT.exec(text);
  if (what?.[1]) return { label: capitalize(norm(what[1]).toLowerCase()) };
  if (PROCEDURE_START.test(text)) return { why: "a procedure, not an item to send" };
  // A paragraph that is only a name ("Welding certificates.", "Field quality-control reports.").
  const bare = /^([A-Z][^.:;]{2,60})\.?$/.exec(text);
  if (bare?.[1] && !/\b(?:shall|must|will|is|are|be|include|includes)\b/i.test(bare[1])) {
    const label = bare[1].trim();
    if (PROCEDURAL_LABEL.test(label)) return { why: "a procedure, not an item to send" };
    return { label };
  }
  return { why: "no name for what to send (the words before a colon)" };
}

/**
 * Lines that are page headers and footers: the same line (digits ignored) in the first or last
 * three lines of three or more pages.
 */
function runningLines(lines: readonly SpecLine[]): Set<string> {
  const byPage = new Map<number, string[]>();
  for (const l of lines) {
    if (l.page === null) continue;
    const list = byPage.get(l.page) ?? [];
    list.push(l.text);
    byPage.set(l.page, list);
  }
  const pagesWith = new Map<string, Set<number>>();
  for (const [page, list] of byPage) {
    const edge = [...list.slice(0, 3), ...list.slice(-3)];
    for (const t of edge) {
      const k = t.replace(/\d+/g, "#");
      const set = pagesWith.get(k) ?? new Set<number>();
      set.add(page);
      pagesWith.set(k, set);
    }
  }
  const out = new Set<string>();
  for (const [k, pages] of pagesWith) if (pages.size >= 3) out.add(k);
  return out;
}

const opensSection = (t: string) => {
  const m = SECTION.exec(t);
  return !!m && !hasLower(m[2] ?? "");
};
const isStructural = (t: string) =>
  opensSection(t) || END_SECTION.test(t) || PART.test(t) || ARTICLE.test(t) || TOP.test(t);

/** An article heading: numbered, short, a title not a sentence. */
function articleTitle(t: string): string | null {
  const m = ARTICLE.exec(t);
  if (!m?.[2]) return null;
  const title = m[2].trim();
  if (title.length > 80 || /[.:;]$/.test(title) || title.includes(":")) return null;
  if (!hasLower(title)) return title;
  // Title case: every longer word capitalized ("Action Submittals").
  const words = title.split(/\s+/).filter((w) => w.length > 3);
  return words.every((w) => /^[A-Z("']/.test(w)) ? title : null;
}

/** An unnumbered heading in capitals naming submittals ("SUBMITTALS", "CLOSEOUT SUBMITTALS"). */
const BARE_SUBMITTAL_HEADING = /^[A-Z][A-Z &/,-]{0,50}\bSUBMITTALS?\b[A-Z &/,-]{0,30}$/;

/** Reads the submittal articles of the sections in `input` (pasted text, or a PDF's lines). */
export function readSpecSubmittals(input: string | readonly SpecLine[]): SpecReading {
  const raw: SpecLine[] =
    typeof input === "string"
      ? input
          .slice(0, MAX_SPEC_CHARS)
          .split(/\r?\n/)
          .map((t) => ({ text: t, page: null }))
      : [...input];
  const lines = raw
    .map((l) => ({ text: unbracket(norm(l.text)), page: l.page }))
    .filter((l) => l.text);
  const running = runningLines(lines);

  const sections: SpecReading["sections"] = [];
  const items: SpecSubmittal[] = [];
  const skipped: SpecSkipped[] = [];
  const notes: string[] = [];
  const division01 = new Set<string>();
  const seen = new Set<string>();
  let dropped = 0;
  let duplicates = 0;

  let section: { number: string; title: string; index: number } | null = null;
  let awaitingTitle = false;
  let group: SpecGroup | null = null;
  let para: string | null = null;
  let paraPage: number | null = null;
  /** In a UFGS list: the submittal description the items below belong to. */
  let sd: { code: string; name: string } | null = null;
  let inNote = false;

  const push = (g: SpecGroup, label: string, type: SubmittalType, text: string, what = label) => {
    const specSection = section?.number ?? null;
    const sectionTitle = section?.title ?? "";
    const title = (sectionTitle ? `${sectionTitle}: ${what}` : what).slice(0, MAX_TITLE);
    const key = `${specSection ?? ""}|${title.toLowerCase()}`;
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
    if (items.length >= MAX_SPEC_ITEMS) {
      dropped += 1;
      return;
    }
    items.push({ specSection, sectionTitle, group: g, label, title, type, text, page: paraPage });
    const s = section ? sections[section.index] : undefined;
    if (s) s.items += 1;
  };

  const flush = () => {
    if (para === null || group === null) {
      para = null;
      return;
    }
    const text =
      para.length > MAX_SPEC_PARAGRAPH ? `${para.slice(0, MAX_SPEC_PARAGRAPH - 1)}…` : para;
    para = null;
    if (sd) {
      // "Control Joint Shop Drawings; G": the item, its approval code, and the description's type
      // unless the description leaves it to the item's name.
      const label = text.replace(DESIGNATION, "").trim();
      if (!label) return;
      const own = specSubmittalType(label);
      const type = SD_TYPES[sd.code] ?? own;
      const what = own === type || !sd.name ? label : `${label} (${sd.name})`;
      push(group, label, type, `SD-${sd.code} ${sd.name}: ${text}`.trim(), what);
      return;
    }
    const l = labelOf(text);
    if ("why" in l) {
      skipped.push({ specSection: section?.number ?? null, text, why: l.why, page: paraPage });
      return;
    }
    push(group, l.label, specSubmittalType(l.label), text);
  };

  for (const { text: t, page } of lines) {
    if (NOTE_RULE.test(t)) {
      inNote = !inNote;
      continue;
    }
    if (inNote) continue;
    if (page !== null && running.has(t.replace(/\d+/g, "#")) && !isStructural(t)) continue;
    if (PAGE_NUMBER.test(t)) continue;
    if (t.length <= 90 && SECTION_FOOTER.test(t) && !isStructural(t)) continue;

    const sec = SECTION.exec(t);
    if (sec?.[1] && !hasLower(sec[2] ?? "")) {
      flush();
      group = null;
      sd = null;
      const number = specSectionNumber(sec[1]);
      let title = titleCase((sec[2] ?? "").trim());
      // The same section named again (a cover page, then the text): one section.
      const again = sections.findIndex((x) => x.specSection === number);
      const index = again >= 0 ? again : sections.length;
      if (again < 0) sections.push({ specSection: number, title, items: 0 });
      const known = sections[index];
      if (known && !title) title = known.title;
      if (known && title) known.title = title;
      section = { number, title, index };
      awaitingTitle = !title;
      if (number.startsWith("01")) division01.add(number);
      continue;
    }
    if (awaitingTitle && section) {
      awaitingTitle = false;
      if (!hasLower(t) && !PART.test(t) && !ARTICLE.test(t) && t.length <= 100) {
        section.title = titleCase(t);
        const s = sections[section.index];
        if (s) s.title = section.title;
        continue;
      }
    }
    if (END_SECTION.test(t)) {
      flush();
      group = null;
      sd = null;
      section = null;
      continue;
    }
    if (PART.test(t)) {
      flush();
      group = null;
      sd = null;
      continue;
    }
    const heading = articleTitle(t) ?? (BARE_SUBMITTAL_HEADING.test(t) ? t : null);
    if (heading) {
      flush();
      const inDiv01 = section ? division01.has(section.number) : false;
      group = /\bsubmittals?\b/i.test(heading) && !inDiv01 ? groupOf(heading) : null;
      sd = null;
      continue;
    }
    if (group === null) continue;
    const sdHead = SD_HEADING.exec(t);
    if (sdHead?.[1]) {
      flush();
      sd = { code: sdHead[1], name: titleCase((sdHead[2] ?? "").trim()) };
      continue;
    }
    if (sd) {
      // One item a line; a line starting in lower case is the one above, wrapped.
      if (para !== null && /^[a-z(]/.test(t)) para = `${para} ${t}`;
      else {
        flush();
        para = t;
        paraPage = page;
      }
      continue;
    }
    const top = TOP.exec(t);
    if (top) {
      flush();
      para = (top[2] ?? "").trim();
      paraPage = page;
      continue;
    }
    if (para === null) continue;
    // A sub-paragraph ("1. Trim Accessories: ...") or a wrapped line: part of the item.
    para = `${para} ${t}`;
  }
  flush();

  if (division01.size)
    notes.push(
      `Division 01 (${[...division01].join(", ")}) sets the submittal procedures for the whole job, so its paragraphs were not read as items.`,
    );
  if (duplicates)
    notes.push(
      `${duplicates} item${duplicates === 1 ? "" : "s"} named twice in the same section ${duplicates === 1 ? "was" : "were"} listed once.`,
    );
  if (dropped)
    notes.push(
      `Only the first ${MAX_SPEC_ITEMS} items are listed; ${dropped} more were found. Read the rest from a file with fewer sections.`,
    );
  if (!sections.length && items.length)
    notes.push(
      'No "SECTION 00 00 00" heading was found, so the items have no spec section. Type it on each row, or read the section from its first page.',
    );
  return { sections, items, skipped, notes, division01: [...division01] };
}

/** The note saved on a row added from the spec: where it came from and the paragraph as read. */
export function specSubmittalNote(s: SpecSubmittal): string {
  const where = [s.specSection, SPEC_GROUP_LABELS[s.group]].filter(Boolean).join(", ");
  return `From the spec (${where}): ${s.text}`.slice(0, 2000);
}

/** A spec PDF's text as lines with their pages, read in the browser. */
export async function specLinesFromPdf(
  bytes: Uint8Array,
): Promise<
  | { ok: true; lines: SpecLine[]; pagesRead: number; pageCount: number }
  | { ok: false; error: string }
> {
  let text: PdfText;
  try {
    text = await extractText(bytes, { maxPages: MAX_SPEC_PAGES });
  } catch (e) {
    if (e instanceof PdfUnreadable)
      return { ok: false, error: `This PDF ${e.message}. Paste the sections' text instead.` };
    return { ok: false, error: "This PDF could not be read. Paste the sections' text instead." };
  }
  if (text.chars - text.unreadable < 20)
    return {
      ok: false,
      error:
        "This PDF has no text to read (a scan with no text layer). Save it as a searchable PDF, or paste the sections' text.",
    };
  if (text.unreadable > 0.2 * text.chars)
    return {
      ok: false,
      error:
        "Most of this PDF's text cannot be read back (its fonts have no character map). Paste the sections' text instead.",
    };
  const lines: SpecLine[] = [];
  for (const page of text.pages) {
    for (const t of linesFromPdfText({ ...text, pages: [page] }))
      lines.push({ text: t, page: page.page });
  }
  return {
    ok: true,
    lines,
    pagesRead: text.pages.length,
    pageCount: text.pageCount ?? text.pages.length,
  };
}
