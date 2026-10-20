// Formats a vendor's own self-reported WCAG 2.1 Level A/AA conformance
// answers into a VPAT(R)-shaped Accessibility Conformance Report (ACR) --
// the document a software vendor attaches to a federal (Section 508) or
// enterprise procurement response.
//
// What this file does NOT do, on purpose: it never decides a conformance
// level, never inspects a product, and never reads or scores an axe-core
// export. Every "Supports" / "Partially Supports" / "Does Not Support" /
// "Not Applicable" / "Not Evaluated" value comes from the vendor's own
// testing, entered by hand. This module only assembles those answers into
// the standard table shape and flags the handful of completeness problems
// that WebAIM's own procurement guidance names as what makes an ACR useless
// to a reviewer (https://webaim.org/articles/procurement/vpat/): a
// Partially-Supports or Does-Not-Support row with no remarks explaining it,
// and a missing header field a reviewer needs to trust the document at all.
// That distinction -- format and completeness, never assessment -- is the
// whole liability position of this product; see README.md.

/**
 * WCAG 2.1 Level A and AA success criteria: {id, name, level}. This is the
 * 50-criterion set VPAT 2.5's WCAG Edition tables walk, grouped here by
 * their four principles (Perceivable / Operable / Understandable / Robust)
 * in the same order the standard and the VPAT template both use. Level AAA
 * and the nine WCAG 2.2 additions are out of scope for this tool -- most
 * ACRs in circulation today are still scored against 2.1 A/AA, and getting
 * a criterion ID or title wrong in a document a vendor attaches to a real
 * bid is the one mistake this tool cannot afford, so the set stays to the
 * criteria this codebase can state with confidence. Verify against the
 * W3C's own "WCAG 2.1 at a Glance" or the ITI VPAT template before
 * submitting, the same as every other output of this tool.
 */
export const WCAG21_AA_CRITERIA = [
  // Perceivable
  { id: '1.1.1', name: 'Non-text Content', wcagLevel: 'A' },
  { id: '1.2.1', name: 'Audio-only and Video-only (Prerecorded)', wcagLevel: 'A' },
  { id: '1.2.2', name: 'Captions (Prerecorded)', wcagLevel: 'A' },
  { id: '1.2.3', name: 'Audio Description or Media Alternative (Prerecorded)', wcagLevel: 'A' },
  { id: '1.2.4', name: 'Captions (Live)', wcagLevel: 'AA' },
  { id: '1.2.5', name: 'Audio Description (Prerecorded)', wcagLevel: 'AA' },
  { id: '1.3.1', name: 'Info and Relationships', wcagLevel: 'A' },
  { id: '1.3.2', name: 'Meaningful Sequence', wcagLevel: 'A' },
  { id: '1.3.3', name: 'Sensory Characteristics', wcagLevel: 'A' },
  { id: '1.3.4', name: 'Orientation', wcagLevel: 'AA' },
  { id: '1.3.5', name: 'Identify Input Purpose', wcagLevel: 'AA' },
  { id: '1.4.1', name: 'Use of Color', wcagLevel: 'A' },
  { id: '1.4.2', name: 'Audio Control', wcagLevel: 'A' },
  { id: '1.4.3', name: 'Contrast (Minimum)', wcagLevel: 'AA' },
  { id: '1.4.4', name: 'Resize Text', wcagLevel: 'AA' },
  { id: '1.4.5', name: 'Images of Text', wcagLevel: 'AA' },
  { id: '1.4.10', name: 'Reflow', wcagLevel: 'AA' },
  { id: '1.4.11', name: 'Non-text Contrast', wcagLevel: 'AA' },
  { id: '1.4.12', name: 'Text Spacing', wcagLevel: 'AA' },
  { id: '1.4.13', name: 'Content on Hover or Focus', wcagLevel: 'AA' },
  // Operable
  { id: '2.1.1', name: 'Keyboard', wcagLevel: 'A' },
  { id: '2.1.2', name: 'No Keyboard Trap', wcagLevel: 'A' },
  { id: '2.1.4', name: 'Character Key Shortcuts', wcagLevel: 'A' },
  { id: '2.2.1', name: 'Timing Adjustable', wcagLevel: 'A' },
  { id: '2.2.2', name: 'Pause, Stop, Hide', wcagLevel: 'A' },
  { id: '2.3.1', name: 'Three Flashes or Below Threshold', wcagLevel: 'A' },
  { id: '2.4.1', name: 'Bypass Blocks', wcagLevel: 'A' },
  { id: '2.4.2', name: 'Page Titled', wcagLevel: 'A' },
  { id: '2.4.3', name: 'Focus Order', wcagLevel: 'A' },
  { id: '2.4.4', name: 'Link Purpose (In Context)', wcagLevel: 'A' },
  { id: '2.4.5', name: 'Multiple Ways', wcagLevel: 'AA' },
  { id: '2.4.6', name: 'Headings and Labels', wcagLevel: 'AA' },
  { id: '2.4.7', name: 'Focus Visible', wcagLevel: 'AA' },
  { id: '2.5.1', name: 'Pointer Gestures', wcagLevel: 'A' },
  { id: '2.5.2', name: 'Pointer Cancellation', wcagLevel: 'A' },
  { id: '2.5.3', name: 'Label in Name', wcagLevel: 'A' },
  { id: '2.5.4', name: 'Motion Actuation', wcagLevel: 'A' },
  // Understandable
  { id: '3.1.1', name: 'Language of Page', wcagLevel: 'A' },
  { id: '3.1.2', name: 'Language of Parts', wcagLevel: 'AA' },
  { id: '3.2.1', name: 'On Focus', wcagLevel: 'A' },
  { id: '3.2.2', name: 'On Input', wcagLevel: 'A' },
  { id: '3.2.3', name: 'Consistent Navigation', wcagLevel: 'AA' },
  { id: '3.2.4', name: 'Consistent Identification', wcagLevel: 'AA' },
  { id: '3.3.1', name: 'Error Identification', wcagLevel: 'A' },
  { id: '3.3.2', name: 'Labels or Instructions', wcagLevel: 'A' },
  { id: '3.3.3', name: 'Error Suggestion', wcagLevel: 'AA' },
  { id: '3.3.4', name: 'Error Prevention (Legal, Financial, Data)', wcagLevel: 'AA' },
  // Robust
  { id: '4.1.1', name: 'Parsing', wcagLevel: 'A' },
  { id: '4.1.2', name: 'Name, Role, Value', wcagLevel: 'A' },
  { id: '4.1.3', name: 'Status Messages', wcagLevel: 'AA' },
];

export const CONFORMANCE_LEVELS = [
  { id: 'supports', label: 'Supports' },
  { id: 'partially-supports', label: 'Partially Supports' },
  { id: 'does-not-support', label: 'Does Not Support' },
  { id: 'not-applicable', label: 'Not Applicable' },
  { id: 'not-evaluated', label: 'Not Evaluated' },
];

const LEVEL_LABEL = new Map(CONFORMANCE_LEVELS.map((l) => [l.id, l.label]));
const VALID_LEVEL_IDS = new Set(CONFORMANCE_LEVELS.map((l) => l.id));

// Rows in these two levels are exactly the ones WebAIM's procurement guidance
// singles out: a reviewer reads Remarks to judge risk, and "generic remarks"
// on a partial or non-conforming row is the specific failure named there.
const REMARKS_REQUIRED_LEVELS = new Set(['partially-supports', 'does-not-support']);

function cleanText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/**
 * Assemble a vendor's per-criterion answers plus header fields into a
 * structured report, and list every completeness issue found. Unanswered
 * criteria default to 'not-evaluated' -- one of the VPAT's own four
 * conformance values, and the honest label for a row nobody has filled in
 * yet, rather than silently dropping it from the document.
 *
 * @param {object} input
 * @param {string} [input.productName]
 * @param {string} [input.productVersion]
 * @param {string} [input.reportDate]
 * @param {string} [input.vendorCompany]
 * @param {string} [input.vendorContact]
 * @param {string} [input.evaluationMethods]
 * @param {string} [input.notes]
 * @param {Record<string, {level?: string, remarks?: string}>} [input.rows]
 */
export function buildReport(input = {}) {
  const rows = input && typeof input.rows === 'object' && input.rows ? input.rows : {};

  const criteria = WCAG21_AA_CRITERIA.map((criterion) => {
    const raw = rows[criterion.id] || {};
    const level = VALID_LEVEL_IDS.has(raw.level) ? raw.level : 'not-evaluated';
    const remarks = cleanText(raw.remarks);
    return { ...criterion, level, levelLabel: LEVEL_LABEL.get(level), remarks };
  });

  const counts = Object.fromEntries(CONFORMANCE_LEVELS.map((l) => [l.id, 0]));
  for (const c of criteria) counts[c.level] += 1;

  const issues = [];
  for (const c of criteria) {
    if (REMARKS_REQUIRED_LEVELS.has(c.level) && !c.remarks) {
      issues.push({
        criterionId: c.id,
        criterionName: c.name,
        kind: 'remarks-required',
        message: `${c.id} ${c.name}: marked "${c.levelLabel}" with no remarks. Reviewers rely on Remarks to judge risk on a partial or non-conforming criterion -- explain what does and doesn't work.`,
      });
    }
  }

  const header = {
    productName: cleanText(input.productName),
    productVersion: cleanText(input.productVersion),
    reportDate: cleanText(input.reportDate),
    vendorCompany: cleanText(input.vendorCompany),
    vendorContact: cleanText(input.vendorContact),
    evaluationMethods: cleanText(input.evaluationMethods),
    notes: cleanText(input.notes),
  };

  const requiredHeaderFields = [
    ['productName', 'Product name'],
    ['reportDate', 'Report date'],
    ['evaluationMethods', 'Evaluation methods used'],
  ];
  for (const [field, label] of requiredHeaderFields) {
    if (!header[field]) {
      issues.push({
        criterionId: null,
        criterionName: null,
        kind: 'header-required',
        message: `${label} is blank. A reviewer weighing this report against competing vendors needs to know how it was tested and when.`,
      });
    }
  }

  const evaluatedCount = WCAG21_AA_CRITERIA.length - counts['not-evaluated'];

  return { header, criteria, counts, issues, totalCriteria: WCAG21_AA_CRITERIA.length, evaluatedCount };
}

function summaryLine(counts, total) {
  return CONFORMANCE_LEVELS.map((l) => `${counts[l.id]} ${l.label}`).join(', ') + ` (of ${total})`;
}

/**
 * Render the assembled report as a plain-text ACR, grouped by WCAG
 * principle the way the VPAT 2.5 WCAG Edition table itself is grouped.
 * This is a *format*, not a determination: every conformance level and
 * every word of Remarks below came from the vendor's own input above.
 */
export function reportAsText(report) {
  const { header, criteria, counts, issues, totalCriteria, evaluatedCount } = report;
  const lines = [
    'Accessibility Conformance Report (VPAT(R) 2.5 -- WCAG Edition)',
    '',
    `Name of Product/Version: ${header.productName || '(not supplied)'}${header.productVersion ? ` ${header.productVersion}` : ''}`,
    `Report Date: ${header.reportDate || '(not supplied)'}`,
    `Vendor Company Name: ${header.vendorCompany || '(not supplied)'}`,
    `Vendor Contact Information: ${header.vendorContact || '(not supplied)'}`,
    'Applicable Standards/Guidelines: WCAG 2.1, Level A and AA (this document does not score Level AAA or WCAG 2.2)',
    `Evaluation Methods Used: ${header.evaluationMethods || '(not supplied)'}`,
    header.notes ? `Notes: ${header.notes}` : '',
    '',
    `Summary: ${summaryLine(counts, totalCriteria)}`,
    `Criteria evaluated: ${evaluatedCount} of ${totalCriteria}`,
    '',
  ].filter((l) => l !== '');

  let principle = '';
  for (const c of criteria) {
    const thisPrinciple = c.id.split('.')[0];
    if (thisPrinciple !== principle) {
      principle = thisPrinciple;
      const names = { 1: 'Perceivable', 2: 'Operable', 3: 'Understandable', 4: 'Robust' };
      lines.push('', `${names[principle] || principle}`, '-'.repeat((names[principle] || principle).length));
    }
    // `c.wcagLevel` is the criterion's own WCAG level (A/AA); `c.levelLabel`
    // is the vendor's *conformance* answer (Supports/...) -- keep those two
    // distinct "level" meanings from colliding in the printed line.
    lines.push(`${c.id} ${c.name} (WCAG Level ${c.wcagLevel}) -- ${c.levelLabel}`);
    if (c.remarks) lines.push(`  Remarks: ${c.remarks}`);
  }

  lines.push(
    '',
    issues.length
      ? `${issues.length} completeness issue(s) before this is submission-ready:`
      : 'No completeness issues found (remarks present on every Partially/Does Not Support row; required header fields filled in).',
  );
  for (const issue of issues) lines.push(`  - ${issue.message}`);

  lines.push(
    '',
    'This report states the vendor\'s own self-assessed conformance level for each criterion, formatted into the standard VPAT/ACR table shape. It is not an independent audit, and it does not certify that this product is accessible or that it satisfies any procurement requirement -- the vendor named above is responsible for the accuracy of every conformance level and remark above, and for verifying this document before submitting it.',
  );

  return lines.join('\n');
}

/** True if every WCAG-level criterion has been touched at least once (level chosen or remarks written) -- a lightweight "did you actually go through the table" signal, distinct from evaluatedCount which only counts non-default levels. */
export function isDraftEmpty(report) {
  return report.criteria.every((c) => c.level === 'not-evaluated' && !c.remarks);
}
