const rules = [
  // Submission wording first, so an earlier question cut-off ("questions are due ...") is not shown as the deadline.
  ['deadline', [
    /(?:(?:proposals?|bids?|offers?|tenders?|quotes?|quotations?|responses?|submissions?|applications?)\s+(?:are\s+|is\s+|shall\s+be\s+|must\s+be\s+|will\s+be\s+)?(?:due|received)\b|closing date|deadline for (?:receipt|submission)|submission deadline|received until)[^\n]{0,100}/i,
    /(?:\bdue\b(?!\s+diligence)|deadline|submit(?:ted| by)|closing date)[^\n]{0,100}/i,
  ], 'Find and verify the submission deadline'],
  // FAR 52.228-1 says "bid guarantee"; many state codes say "bid security".
  ['bond', /(?:(?:bid|tender|performance|payment) (?:bond|guarantee)|bid security|surety bond)[^\n]{0,100}/i, 'Confirm bond type and amount with the tender'],
  ['insurance', /(?:insurance|certificate of insurance|liability coverage)[^\n]{0,100}/i, 'Confirm required insurance limits and certificate wording'],
  ['certification', /(?:certif(?:ication|ied)|license|accreditation|registration)[^\n]{0,100}/i, 'Confirm every required license or certification'],
  ['site-visit', /(?:mandatory\s+(?:pre-?bid|site visit|attendance)|pre-?bid (?:meeting|conference)|site visit)[^\n]{0,100}/i, 'Confirm whether a pre-bid meeting or site visit is mandatory — a missed mandatory one usually cannot be made up'],
  ['submission', /(?:submit|submission|portal|envelope|email)[^\n]{0,100}/i, 'Confirm the exact submission channel and format'],
  ['questions', /(?:question|clarification|inquir|addend(?:um|a))[^\n]{0,100}/i, 'Record the question deadline and check addenda'],
];

export function checkTender(text) {
  const source = String(text ?? '').trim();
  if (!source) return { score: 0, findings: [], warnings: ['Paste the solicitation text to begin.'] };
  const findings = rules.map(([key, pattern, action]) => {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    const match = patterns.map((re) => source.match(re)).find(Boolean);
    return { key, found: Boolean(match), evidence: match?.[0].trim() ?? '', action };
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
