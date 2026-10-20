// RFP compliance-matrix extractor. Deterministic, no network, no dependencies.
//
// Reads solicitation text and returns one row per obligation the offeror
// has to answer ("shall", "must", "is required to", ...), tagged with the
// nearest section reference, a category and a strength, plus the proposal
// *instructions* (page limits, fonts, copies, due dates) kept apart because
// they are checked once at the end, not answered in a section.
//
// It is a first pass for a human proposal manager, not a reading of the
// document: every row keeps the sentence it came from so it can be checked.

export const CATEGORIES = [
  ['Pricing', /\b(price|pricing|cost|rates?|invoice|payment|fee|labor categor|CLIN|not[- ]to[- ]exceed|fixed[- ]price|wage)\b/i],
  ['Insurance & bonds', /\b(insurance|insured|bond(?:ed|ing)?|surety|indemnif|liability coverage|certificate of insurance)\b/i],
  ['Security & privacy', /\b(security|FedRAMP|FISMA|NIST|CMMC|clearance|encrypt|HIPAA|privacy|PII|background check|confidential|audit log)\b/i],
  ['Past performance', /\b(past performance|references?|similar (?:projects?|contracts?|work)|prior experience|track record)\b/i],
  ['Staffing & key personnel', /\b(key personnel|staff(?:ing)?|personnel|resumes?|qualified|years of experience|employees?|subcontractors?)\b/i],
  ['Certifications & licenses', /\b(certif(?:y|ied|ication|icate)|licen[sc]e[ds]?|accredit|registered|registration|SAM\.gov|small business|8\(a\)|HUBZone|WOSB|SDVOSB|DBE|MBE)\b/i],
  ['Reporting & deliverables', /\b(report(?:s|ing)?|deliverables?|milestones?|schedule|status|within \d+|no later than|documentation|training)\b/i],
  ['Proposal format', /\b(proposal|offer|submit(?:ted)?|submission|volume|page limit|font|copies|binder|electronic|portal|envelope)\b/i],
  ['Technical', /\b(system|software|platform|solution|interface|integrat|API|uptime|availability|perform|capacity|support|maintain|provide|implement|configure|data)\b/i],
];

const STRONG = /\b(shall|must|is required to|are required to|will be required to|is responsible for|are responsible for|required to|needs? to|has to|have to)\b/i;
const MANDATORY_NOUN = /\b(is|are) (?:mandatory|required)\b|\bmandatory\b/i;
const WEAK = /\b(should|is expected to|are expected to|is encouraged to|recommended|preferred|desirable|desired|ideally)\b/i;
// "The Government will review ..." is the buyer's duty, not the offeror's.
const BUYER_WILL = /\b(the )?(government|agency|county|city|state|district|authority|department|owner|buyer|purchaser|board|committee|contracting officer|CO|COR|evaluators?|we|the university)\b[^.]{0,40}\bwill\b/i;
const OFFEROR_WILL = /\b(contractor|offeror|vendor|bidder|proposer|respondent|supplier|consultant|firm|you|the awardee|the successful)\b[^.]{0,40}\bwill\b/i;
const NEGATIVE = /\b(shall not(?! exceed)|must not(?! exceed)|may not(?! exceed)|is prohibited|are prohibited|not permitted|not allowed)\b/i;

const INSTRUCTION = [
  ['Page limit', /\b(?:not (?:to )?exceed|no more than|maximum of|limited to|up to)\s+(\d+)\s+(?:single[- ]sided\s+|double[- ]sided\s+)?pages?\b|\b(\d+)[- ]page (?:limit|maximum)\b/i],
  ['Font / format', /\b(\d{1,2})[- ]?(?:pt|point)\b[^.]{0,40}|\b(?:times new roman|arial|calibri|helvetica|single[- ]spaced|double[- ]spaced|margins?)\b[^.]{0,60}/i],
  ['Copies / media', /\b(\d+|one|two|three|four|five|six)\s+(?:\(\d+\)\s+)?(?:hard[- ]?copies|hard copy|printed copies|paper copies|copies|originals?|flash drives?|USBs?)\b[^.]{0,60}/i],
  ['Due date', /\b(?:due|deadline|no later than|closing date|must be received (?:by|before)|submit(?:ted)? (?:by|before|no later than))\b[^.\n]{0,100}\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4}|\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)[^.\n]{0,20})/i],
  ['Questions deadline', /\b(?:questions?|inquiries|clarifications?|requests? for information)\b[^.\n]{0,80}\b(?:due|by|before|no later than)\b[^.\n]{0,80}/i],
  ['Submission channel', /\b(?:submit(?:ted)?|deliver(?:ed)?|upload(?:ed)?)\b[^.\n]{0,80}\b(?:via|through|to|at|using)\b[^.\n]{0,80}\b(?:portal|e-?mail|SAM\.gov|bonfire|periscope|bidnet|ariba|jaggaer|address|sealed envelope)\b[^.\n]{0,60}/i],
  ['Mandatory meeting', /\bmandatory\b[^.\n]{0,60}\b(?:pre-?bid|pre-?proposal|site visit|conference|meeting|walk-?through)\b[^.\n]{0,80}/i],
  ['Required forms', /\b(?:W-?9|SF[- ]?\d{2,4}|certification forms?|affidavit|notari[sz]ed|signed (?:cover )?(?:letter|form)|addend(?:um|a) acknowledg\w+|acknowledg\w+ (?:of )?addend\w+)\b[^.\n]{0,80}/i],
];

const HEADING = /^\s*((?:section|part|article|volume|attachment|exhibit)\s+[A-Z0-9]+(?:[.\-][A-Z0-9]+)*|[A-Z]\.\d+(?:\.\d+)*|\d+(?:\.\d+){0,5})[.):]?\s+(.*)$/i;
const BULLET = /^\s*(?:\(?[a-z0-9]{1,3}[.)]|[-*•–])\s+/i;

function clean(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

function splitSentences(paragraph) {
  // Split on ., ?, ! followed by space+capital/digit/quote; keep common
  // abbreviations ("e.g.", "i.e.", "U.S.", "No.", "Inc.") together.
  const protectedText = paragraph
    .replace(/\b(e\.g|i\.e|etc|vs|No|Inc|Corp|Ltd|U\.S|Mr|Ms|Dr|Sec|Art|Para|approx|incl)\./gi, (m) => m.replace(/\./g, '\u0001'))
    .replace(/(\d)\.(\d)/g, '$1\u0001$2');
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9("'“])/)
    .map((s) => s.replace(/\u0001/g, '.'))
    .map(clean)
    .filter(Boolean);
}

export function classify(text) {
  if (INSTRUCTION.some(([, rx]) => rx.test(text))) return 'Proposal format';
  for (const [name, rx] of CATEGORIES) if (rx.test(text)) return name;
  return 'General';
}

export function strengthOf(sentence) {
  if (NEGATIVE.test(sentence)) return 'Prohibition';
  if (BUYER_WILL.test(sentence) && !STRONG.test(sentence)) return null;
  if (STRONG.test(sentence) || MANDATORY_NOUN.test(sentence)) return 'Mandatory';
  if (OFFEROR_WILL.test(sentence)) return 'Mandatory';
  if (WEAK.test(sentence)) return 'Desirable';
  return null;
}

/** Break the document into blocks, remembering the section reference each sits under. */
function blocks(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let section = '';
  let current = null;
  const flush = () => {
    if (current && current.text.trim()) out.push(current);
    current = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flush(); continue; }
    const h = line.match(HEADING);
    // A heading is short, has no terminal sentence punctuation, and does not
    // itself carry an obligation. "3.1 The contractor shall ..." is a
    // requirement with a reference number, not a heading.
    const looksLikeHeading = h && h[2].length <= 80 && !/[.;:]$/.test(h[2].trim()) && !STRONG.test(h[2]) && h[2].trim().split(/\s+/).length <= 10;
    if (looksLikeHeading) {
      flush();
      section = h[1].replace(/[.):]$/, '');
      current = { section, heading: clean(h[2]), text: '', numbered: false };
      flush();
      continue;
    }
    const numbered = h && !looksLikeHeading ? h[1].replace(/[.):]$/, '') : null;
    if (numbered) {
      flush();
      section = numbered;
      current = { section, text: clean(h[2]), bullets: [] };
      continue;
    }
    if (BULLET.test(line) && current) {
      current.bullets = current.bullets || [];
      current.bullets.push(clean(line.replace(BULLET, '')));
      continue;
    }
    if (!current) current = { section, text: '', bullets: [] };
    current.text += (current.text ? ' ' : '') + clean(line);
  }
  flush();
  return out;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();

export function extract(text) {
  const source = String(text ?? '').trim();
  if (!source) {
    return { requirements: [], instructions: [], counts: {}, warnings: ['Paste the solicitation text to begin.'], duplicates: 0 };
  }
  const requirements = [];
  const instructions = [];
  const seen = new Map();
  let duplicates = 0;
  let n = 0;
  const seenInstr = new Set();

  const addRequirement = (sentence, section, lead) => {
    const strength = strengthOf(lead ? `${lead} ${sentence}` : sentence);
    if (!strength) return;
    const full = lead ? `${lead} ${sentence}` : sentence;
    const key = norm(full);
    if (seen.has(key)) {
      duplicates += 1;
      seen.get(key).also.push(section || '—');
      return;
    }
    n += 1;
    const row = {
      id: `REQ-${String(n).padStart(3, '0')}`,
      section: section || '',
      text: full,
      strength,
      category: classify(full),
      also: [],
    };
    seen.set(key, row);
    requirements.push(row);
  };

  for (const block of blocks(source)) {
    const sentences = splitSentences(block.text);
    for (const s of sentences) {
      for (const [name, rx] of INSTRUCTION) {
        const m = s.match(rx);
        if (m) {
          const k = `${name}|${norm(s)}`;
          if (!seenInstr.has(k)) {
            seenInstr.add(k);
            instructions.push({ type: name, section: block.section || '', text: s });
          }
        }
      }
    }
    const bullets = block.bullets || [];
    if (bullets.length && sentences.length) {
      // A lead-in sentence that carries the obligation ("The Contractor shall:")
      // governs every bullet beneath it; each becomes its own row.
      const lead = sentences[sentences.length - 1].replace(/[:;]\s*$/, '');
      const leadStrength = strengthOf(lead);
      for (const b of bullets) {
        const own = strengthOf(b);
        if (leadStrength || own) {
          const lastSentence = leadStrength ? `${lead}: ${b.replace(/[.;,]?\s*(?:and|or)?[.;,]?\s*$/i, '')}.` : b;
          addRequirement(lastSentence, block.section, '');
        }
        for (const [name, rx] of INSTRUCTION) {
          if (rx.test(b)) {
            const k = `${name}|${norm(b)}`;
            if (!seenInstr.has(k)) { seenInstr.add(k); instructions.push({ type: name, section: block.section || '', text: b }); }
          }
        }
      }
      for (const s of sentences.slice(0, -1)) addRequirement(s, block.section, '');
      if (!leadStrength) addRequirement(sentences[sentences.length - 1], block.section, '');
    } else {
      for (const s of sentences) addRequirement(s, block.section, '');
    }
  }

  const counts = { total: requirements.length, byCategory: {}, byStrength: {} };
  for (const r of requirements) {
    counts.byCategory[r.category] = (counts.byCategory[r.category] || 0) + 1;
    counts.byStrength[r.strength] = (counts.byStrength[r.strength] || 0) + 1;
  }
  const warnings = [
    'Heuristic extraction only: a sentence can hold two obligations, and an obligation can hide in a table, a figure or an attachment that was not pasted. Read the solicitation yourself.',
  ];
  if (!requirements.length) warnings.push('No "shall / must / required" sentences were found. Check that you pasted the statement of work and instructions, not only the cover page.');
  const unsectioned = requirements.filter((r) => !r.section).length;
  if (requirements.length && unsectioned === requirements.length) warnings.push('No section numbers were detected, so the Section column is empty. Pasting with the original numbering (e.g. "3.2.1") fills it.');
  if (duplicates) warnings.push(`${duplicates} repeated sentence(s) were merged into the first occurrence; the "Also in" column lists where they reappear.`);
  return { requirements, instructions, counts, warnings, duplicates };
}

/* ---------------- exports ---------------- */

// Spreadsheet formula injection: a cell starting with = + - @ (or tab/CR) is
// executed by Excel and Sheets. Pasted solicitation text is untrusted.
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const MATRIX_COLUMNS = ['ID', 'Section', 'Requirement', 'Strength', 'Category', 'Also in', 'Response owner', 'Status', 'Proposal section', 'Notes'];

export function toCsv(result) {
  const rows = [MATRIX_COLUMNS.map(csvCell).join(',')];
  for (const r of result.requirements) {
    rows.push([r.id, r.section, r.text, r.strength, r.category, r.also.join('; '), '', 'Not started', '', ''].map(csvCell).join(','));
  }
  if (result.instructions.length) {
    rows.push('');
    rows.push(['Instruction type', 'Section', 'Text'].map(csvCell).join(','));
    for (const i of result.instructions) rows.push([i.type, i.section, i.text].map(csvCell).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdown(result) {
  const out = ['| ID | Section | Requirement | Strength | Category | Owner | Status |', '|---|---|---|---|---|---|---|'];
  for (const r of result.requirements) out.push(`| ${r.id} | ${mdCell(r.section)} | ${mdCell(r.text)} | ${r.strength} | ${r.category} |  | Not started |`);
  if (result.instructions.length) {
    out.push('', '### Proposal instructions', '', '| Type | Section | Text |', '|---|---|---|');
    for (const i of result.instructions) out.push(`| ${i.type} | ${mdCell(i.section)} | ${mdCell(i.text)} |`);
  }
  return out.join('\n') + '\n';
}
