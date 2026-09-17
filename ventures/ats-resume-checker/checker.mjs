/**
 * The ATS copy-paste test, as a deterministic module.
 *
 * The technique this automates is a real one career coaches already
 * recommend by hand: copy all the text out of your resume file (Ctrl+A,
 * Ctrl+C from the PDF or Word doc — never retype it) and look at what comes
 * out. Applicant tracking systems extract resume text the same mechanical
 * way a PDF viewer's copy command does; if the copy is garbled, out of
 * order, or missing a section, the parser sees the same mess. This module
 * looks for the specific, well-documented symptoms of that mess:
 *
 *   - icon-font / private-use-area characters standing in for bullets or
 *     icons, which some resume templates use and which paste as garbage
 *     (and parse as garbage in an ATS the same way)
 *   - the Unicode replacement character, a hard signal of a bad text
 *     extraction upstream of this page
 *   - no recognizable section headings (Experience, Education, Skills, ...),
 *     which is what an ATS's section parser keys off of
 *   - no email or phone number near the top of the document, or one that
 *     only shows up deep in the body -- a common symptom of contact info
 *     living in a header/footer or a sidebar column that collapsed out of
 *     place when copied
 *   - no recognizable year, which is what a timeline parser keys off of
 *   - runs of unusual mid-line whitespace, a common artifact of a
 *     multi-column layout flattening into one line on copy
 *
 * None of this proves a specific employer's ATS will or will not accept the
 * resume -- ATS products differ, and this reads only the text handed to it.
 * It is evidence to act on, not a verdict: every finding names what was
 * found and why it matters, and leaves the decision to the person who wrote
 * the resume. See index.html's disclaimer for the exact wording.
 */

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

const SECTION_HEADINGS = [
  "work experience",
  "professional experience",
  "employment history",
  "experience",
  "education",
  "technical skills",
  "core competencies",
  "skills",
  "professional summary",
  "summary of qualifications",
  "summary",
  "objective",
  "certifications",
  "projects",
  "publications",
  "awards",
  "volunteer experience",
];

// U+E000-U+F8FF: the Unicode Private Use Area. No standard character lives
// here, so anything in this range in ordinary running text is a font's own
// private glyph -- most often an icon-font bullet or icon in a resume
// template -- copied out as the raw code point instead of the icon it
// displayed as.
const PRIVATE_USE_AREA = /[-]/;

const REPLACEMENT_CHAR = /�/;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/;

// Four or more spaces (or a tab) in the middle of a line of otherwise
// ordinary text is not how prose wraps -- it is how two side-by-side table
// or column cells read once flattened onto one line.
const MID_LINE_GAP = /\S[ \t]{4,}\S/;

/** How far into the document (0-1) does `re` first match? Null if never. */
function firstMatchFraction(text, re) {
  const match = re.exec(text);
  if (!match) return null;
  return text.length === 0 ? 0 : match.index / text.length;
}

function hasHeading(text) {
  const lower = text.toLowerCase();
  return SECTION_HEADINGS.some((heading) => {
    // A heading is its own line (optionally with trailing punctuation/colon
    // or wrapped in markup-free emphasis characters), not a heading word
    // used mid-sentence -- "I have five years of experience" should not
    // count.
    const re = new RegExp(`(^|\\n)[\\s*_-]*${heading}[\\s*_:-]*($|\\n)`, "i");
    return re.test(lower);
  });
}

/**
 * Analyse pasted resume text and return every finding, most severe first.
 *
 * @param {string} text - raw text copied out of a resume file
 * @returns {{ findings: Array<{id: string, severity: string, title: string, detail: string}>, stats: object }}
 */
export function analyze(text) {
  const t = typeof text === "string" ? text : "";
  const trimmed = t.trim();
  const findings = [];

  if (trimmed.length < 200) {
    findings.push({
      id: "too-short",
      severity: SEVERITY.HIGH,
      title: "Very little text came through",
      detail: `Only ${trimmed.length} characters of text were pasted. A typical one-page resume copies out to well over a thousand. If this is your whole resume, most of its content is likely living in an image, a text box, or a table that didn't copy as text — which means an ATS parser wouldn't extract it either.`,
    });
  }

  if (PRIVATE_USE_AREA.test(t)) {
    const count = (t.match(new RegExp(PRIVATE_USE_AREA, "g")) || []).length;
    findings.push({
      id: "private-use-glyphs",
      severity: SEVERITY.HIGH,
      title: `${count} icon-font character${count === 1 ? "" : "s"} found`,
      detail: "These code points (U+E000–U+F8FF) have no standard meaning — they only render as a bullet, checkmark, or icon because your resume template embeds a matching icon font. Outside that template (including inside most ATS text extractors), they show up as this same unreadable character. Replace decorative icon bullets with a plain hyphen or asterisk.",
    });
  }

  if (REPLACEMENT_CHAR.test(t)) {
    findings.push({
      id: "replacement-char",
      severity: SEVERITY.HIGH,
      title: "Corrupted characters found (�)",
      detail: "This is the Unicode “replacement character” — proof that whatever produced this text (a PDF export, an OCR pass, a copy from a scanned image) already failed to read a character correctly upstream of this page. An ATS parser reading the same file will hit the same corruption.",
    });
  }

  if (!hasHeading(t)) {
    findings.push({
      id: "no-standard-headings",
      severity: SEVERITY.MEDIUM,
      title: "No standard section heading recognized",
      detail: "Parsers look for headings like “Experience,” “Education,” and “Skills” to split a resume into sections. None of the common phrasings for those were found on their own line. This can mean your resume uses creative heading names (“My Journey,” “What I Bring”) that a parser won't recognize, or that headings are set as images or graphics rather than text.",
    });
  }

  const emailAt = firstMatchFraction(t, EMAIL_RE);
  const phoneAt = firstMatchFraction(t, PHONE_RE);
  const contactAt = [emailAt, phoneAt].filter((v) => v !== null);
  if (contactAt.length === 0) {
    findings.push({
      id: "no-contact-info",
      severity: SEVERITY.HIGH,
      title: "No email or phone number detected",
      detail: "Neither an email address nor a phone number pattern was found anywhere in the pasted text. If your resume shows one, it likely lives in a header, footer, text box, or image that this paste didn't carry — the same content many ATS platforms skip or fail to associate with your profile.",
    });
  } else if (Math.min(...contactAt) > 0.35) {
    findings.push({
      id: "contact-info-buried",
      severity: SEVERITY.MEDIUM,
      title: "Contact info appears well into the document",
      detail: "Your email or phone number wasn't found until past the first third of the pasted text. Contact details usually sit at the very top of a resume; finding them deep in the body is a common symptom of a document header, footer, or sidebar that copies out of its intended position.",
    });
  }

  if (!YEAR_RE.test(t)) {
    findings.push({
      id: "no-dates",
      severity: SEVERITY.MEDIUM,
      title: "No recognizable year found",
      detail: "No four-digit year between 1950 and 2049 was found in the text. Parsers build a work-history timeline from the dates on each role; if your dates copied as something a parser can't read (an image, an unusual format, or a date field that didn't extract), the timeline it builds will be empty or wrong.",
    });
  }

  const lines = t.split("\n");
  const gapLines = lines.filter((line) => MID_LINE_GAP.test(line)).length;
  if (gapLines >= 3) {
    findings.push({
      id: "mid-line-gaps",
      severity: SEVERITY.LOW,
      title: `${gapLines} lines contain large mid-line gaps`,
      detail: "Several lines have four or more spaces (or a tab) in the middle rather than at the start — the usual shape of two side-by-side columns or table cells flattening onto a single line when copied. If your resume uses a multi-column layout or tables for skills or dates, some parsers read these left-to-right per visual line rather than by column, scrambling the result.",
    });
  }

  const severityRank = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    findings,
    stats: {
      characters: trimmed.length,
      lines: lines.length,
      highCount: findings.filter((f) => f.severity === SEVERITY.HIGH).length,
      mediumCount: findings.filter((f) => f.severity === SEVERITY.MEDIUM).length,
      lowCount: findings.filter((f) => f.severity === SEVERITY.LOW).length,
    },
  };
}

/** One-line summary of an analysis, for a headline. Never a pass/fail claim. */
export function summarize({ findings, stats }) {
  if (findings.length === 0) {
    return {
      level: "clean",
      text: "No copy-paste artifacts found in what you pasted.",
    };
  }
  if (stats.highCount > 0) {
    return {
      level: "high",
      text: `${findings.length} potential issue${findings.length === 1 ? "" : "s"} found, ${stats.highCount} likely to affect ATS parsing.`,
    };
  }
  return {
    level: "medium",
    text: `${findings.length} potential issue${findings.length === 1 ? "" : "s"} found, worth a look.`,
  };
}
