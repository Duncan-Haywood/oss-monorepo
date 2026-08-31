const rules = [
  ['deadline', /(?:due|deadline|submit(?:ted| by)|closing date|responses? due)[^\n]{0,100}/i, 'Find and verify the submission deadline'],
  ['bond', /(?:bid|tender|performance|payment) bond[^\n]{0,100}/i, 'Confirm bond type and amount with the tender'],
  ['insurance', /(?:insurance|certificate of insurance|liability coverage)[^\n]{0,100}/i, 'Confirm required insurance limits and certificate wording'],
  ['certification', /(?:certif(?:ication|ied)|license|accreditation|registration)[^\n]{0,100}/i, 'Confirm every required license or certification'],
  ['submission', /(?:submit|submission|portal|envelope|email)[^\n]{0,100}/i, 'Confirm the exact submission channel and format'],
  ['questions', /(?:question|clarification|inquir|addend(?:um|a))[^\n]{0,100}/i, 'Record the question deadline and check addenda'],
];

export function checkTender(text) {
  const source = String(text ?? '').trim();
  if (!source) return { score: 0, findings: [], warnings: ['Paste the solicitation text to begin.'] };
  const findings = rules.map(([key, pattern, action]) => {
    const match = source.match(pattern);
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
