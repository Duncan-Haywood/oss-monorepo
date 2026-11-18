// Word boundaries keep "coinsurance" from counting as insurance and "Due to site constraints" from counting as a
// deadline. FAR wording ("bid guarantee", "received no later than", "time set for opening", SF 30 amendment
// acknowledgement) is matched as well as the plain-English forms (quality audit round 53,
// portfolio/quality/audits/2026-11-12-tender-bid-readiness.json).
const rules = [
  ['deadline', /\b(?:due(?!\s+to\b)|deadline|submit(?:ted)? by|closing date|responses? due|(?:must be )?received (?:no later than|by)|time (?:and date )?set for (?:the )?(?:receipt|opening)|publicly opened)\b/i, 'Find and verify the submission deadline'],
  ['bond', /\b(?:(?:bid|tender|performance|payment) bonds?|bid guarantee|bid security)\b/i, 'Confirm bond type and amount with the tender'],
  ['insurance', /\b(?:insurance|certificates? of insurance|liability coverage)\b/i, 'Confirm required insurance limits and certificate wording'],
  ['certification', /\b(?:certification|certified(?!\s+(?:check|cheque|payroll|mail))|licen[cs]e[ds]?|accreditation|registration|registered in SAM)\b/i, 'Confirm every required license or certification'],
  ['site-visit', /\b(?:mandatory\s+(?:pre-?bid|site visit|attendance)|pre-?bid (?:meeting|conference)|site visits?)\b/i, 'Confirm whether a pre-bid meeting or site visit is mandatory — a missed mandatory one usually cannot be made up'],
  ['submission', /\b(?:submit|submission|portal|envelope|e-?mail)\b/i, 'Confirm the exact submission channel and format'],
  ['questions', /\b(?:questions?|clarifications?|inquir(?:y|ies)|addend(?:um|a)|amendments?|SF\s*30)\b/i, 'Record the question deadline and check addenda'],
];

// "A bid bond is not required", "No site visit will be held": the signal is mentioned but waived. Hyphenated
// words ("No pre-bid meeting will be held") count as one word.
const NEGATED = /\b(?:not (?:be )?(?:required|mandatory|needed)|is waived|will not be held|no (?:[\w-]+\s+){0,3}(?:will be|is) (?:held|required)(?!\s+to\b))\b/i;
// A requirement stated in the same clause outweighs a waiver there: "Firms with no local office will be required to
// attend the mandatory site visit" is an obligation, and so is "A bid bond is required and insurance is not
// required" for the bond (reading a required item as waived is the costly mistake, so a mixed clause counts as found).
const AFFIRMED = /\b(?:(?:is|are|will be|shall be|must be) (?:required|mandatory)|(?:must|shall) (?!not\b)\w+)\b/i;
// Contrast words start a new clause: in "bond and insurance are required, but a site visit is not required" the
// waiver belongs to the site visit only.
const CLAUSE = /\s*(?:[,;]\s*)?\b(?:but|however|whereas|while|although|though|except that)\b\s*/i;

function clauseAt(sentence, index) {
  let start = 0;
  for (const part of sentence.split(new RegExp(CLAUSE.source, 'gi'))) {
    const at = sentence.indexOf(part, start);
    if (index < at + part.length) return part;
    start = at + part.length;
  }
  return sentence;
}

const waivedIn = (clause) => NEGATED.test(clause) && !AFFIRMED.test(clause.replace(NEGATED, ' '));
const QUESTION_LINE = /\b(?:questions?|inquir(?:y|ies)|clarifications?|RFIs?)\b/i;

// Match sentence by sentence so negation and "question" context before the keyword are seen.
const sentences = (source) => source.split(/(?<=[.;!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);

function pick(key, list, pattern) {
  const hits = list.map((sentence) => ({ sentence, m: sentence.match(pattern) })).filter((h) => h.m);
  if (!hits.length) return null;
  // The bid deadline, not the question deadline: a guide page here says to look for "two deadlines, not one".
  const hit = key === 'deadline'
    ? hits.find((h) => !QUESTION_LINE.test(h.sentence)) ?? hits[0]
    : hits.find((h) => !waivedIn(clauseAt(h.sentence, h.m.index))) ?? hits[0];
  return { evidence: hit.sentence.slice(hit.m.index, hit.m.index + hit.m[0].length + 100).trim(), negated: waivedIn(clauseAt(hit.sentence, hit.m.index)) };
}

export function checkTender(text) {
  const source = String(text ?? '').trim();
  if (!source) return { score: 0, findings: [], warnings: ['Paste the solicitation text to begin.'] };
  const list = sentences(source);
  const findings = rules.map(([key, pattern, action]) => {
    const match = pick(key, list, pattern);
    const evidence = match?.evidence ?? '';
    const waived = Boolean(match) && key !== 'deadline' && match.negated;
    return waived
      ? { key, found: false, waived: true, evidence, action: `${action}. The text appears to say it is not required: confirm.` }
      : { key, found: Boolean(match), evidence, action };
  });
  const found = findings.filter((item) => item.found).length;
  return {
    score: Math.round((found / rules.length) * 100),
    findings,
    warnings: [
      'Heuristic extraction only: read the original solicitation, attachments, and addenda yourself.',
      found < rules.length ? `${rules.length - found} readiness signal(s) were not found in the pasted text.` : 'All common readiness signals were found; verify each one against the source.',
    ],
  };
}
