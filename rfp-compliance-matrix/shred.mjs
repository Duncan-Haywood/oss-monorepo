// Response outline and draft-coverage check. Deterministic, no network.
//
// After the matrix: (1) outline() turns the requirement rows into a proposal
// skeleton (volumes/sections, each listing the requirement IDs it must answer),
// and (2) coverage() reads your draft response and says which requirements it
// does not appear to address yet. Coverage is a term-overlap heuristic, not
// comprehension: it finds gaps to look at, it cannot certify compliance.

const VOLUME = {
  'Technical': 'Technical approach',
  'Reporting & deliverables': 'Technical approach',
  'Staffing & key personnel': 'Management and staffing',
  'Past performance': 'Past performance and references',
  'Pricing': 'Price proposal',
  'Insurance & bonds': 'Insurance, bonds and representations',
  'Certifications & licenses': 'Insurance, bonds and representations',
  'Security & privacy': 'Security and privacy',
  'Proposal format': 'Administrative and format compliance',
};
const ORDER = [
  'Administrative and format compliance',
  'Technical approach',
  'Management and staffing',
  'Security and privacy',
  'Past performance and references',
  'Insurance, bonds and representations',
  'Price proposal',
];

export function outline(result) {
  const groups = new Map(ORDER.map((h) => [h, []]));
  for (const r of result.requirements) {
    const h = VOLUME[r.category] || 'Technical approach';
    groups.get(h).push(r);
  }
  return ORDER.filter((h) => groups.get(h).length).map((heading) => {
    const rows = groups.get(heading);
    return {
      heading,
      ids: rows.map((r) => r.id),
      mandatory: rows.filter((r) => r.strength === 'Mandatory').length,
      rows,
    };
  });
}

export function toOutlineMarkdown(result) {
  const out = ['# Proposal response outline', '', '_Skeleton generated from the compliance matrix. Rename and reorder to match the solicitation\'s required proposal structure (Section L / instructions to offerors), which controls._', ''];
  let n = 0;
  for (const v of outline(result)) {
    n += 1;
    out.push(`## ${n}. ${v.heading}`, '', `${v.rows.length} requirement(s), ${v.mandatory} mandatory.`, '');
    for (const r of v.rows) {
      out.push(`### ${n}.${v.rows.indexOf(r) + 1} ${r.id}${r.section ? ` (RFP ${r.section})` : ''} — ${r.strength}`, '', `> ${r.text}`, '', '**Compliance statement:** _TODO_', '');
    }
  }
  if (result.instructions.length) {
    out.push('## Final check: proposal instructions', '');
    for (const i of result.instructions) out.push(`- [ ] **${i.type}** (${i.section || '—'}): ${i.text}`);
    out.push('');
  }
  return out.join('\n');
}

/* ---------------- coverage ---------------- */

const STOP = new Set(('a an the and or of to in on for with by at as is are be been being shall must will should may can not no any all each every ' +
  'this that these those it its their there which who whom whose from into per than then also such other any contractor offeror vendor bidder ' +
  'proposer respondent supplier firm proposal provide provided providing ensure include including includes require required requirement ' +
  'requirements within under upon through over about between').split(' '));

export function keyTerms(text) {
  const out = new Set();
  for (const w of String(text).toLowerCase().match(/[a-z0-9][a-z0-9.\-/]*[a-z0-9]|[a-z0-9]/g) || []) {
    const t = stem(w);
    if (t.length < 3 || STOP.has(t)) continue;
    out.add(t);
  }
  return out;
}

function stem(w) {
  return w.replace(/(ing|ed|es|s|ly)$/, (m, _s, i) => (i >= 4 ? '' : m));
}

export const THRESHOLDS = { addressed: 0.6, partial: 0.3 };

export function coverage(result, draft) {
  const text = String(draft ?? '');
  const draftTerms = keyTerms(text);
  const ids = new Set((text.match(/\bREQ-\d{3}(?:\.\d+)?\b/g) || []).map((s) => s.toUpperCase()));
  const rows = result.requirements.map((r) => {
    const terms = [...keyTerms(r.text)];
    const hit = terms.filter((t) => draftTerms.has(t));
    const score = terms.length ? hit.length / terms.length : 0;
    const byId = ids.has(r.id);
    const status = byId || score >= THRESHOLDS.addressed ? 'addressed' : score >= THRESHOLDS.partial ? 'partial' : 'missing';
    return { id: r.id, section: r.section, strength: r.strength, text: r.text, status, score: Math.round(score * 100) / 100, referencedById: byId, missingTerms: terms.filter((t) => !draftTerms.has(t)).slice(0, 8) };
  });
  const summary = { addressed: 0, partial: 0, missing: 0 };
  for (const r of rows) summary[r.status] += 1;
  const mandatoryGaps = rows.filter((r) => r.strength === 'Mandatory' && r.status !== 'addressed').map((r) => r.id);
  return {
    rows,
    summary,
    mandatoryGaps,
    warnings: ['Term-overlap heuristic: "addressed" means the draft uses most of the requirement\'s key words (or cites its REQ id), not that it satisfies the requirement. Read every row marked addressed that matters.'],
  };
}

export function coverageToCsv(cov, csvCell) {
  const lines = [['ID', 'Section', 'Strength', 'Status', 'Score', 'Terms not found in draft', 'Requirement'].map(csvCell).join(',')];
  for (const r of cov.rows) lines.push([r.id, r.section, r.strength, r.status, r.score, r.missingTerms.join(' '), r.text].map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}
