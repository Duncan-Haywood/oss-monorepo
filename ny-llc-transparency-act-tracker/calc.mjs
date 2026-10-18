// Pure logic for the NY LLC Transparency Act (NYLTA) organizer: entity
// classification, filing deadlines, and the beneficial-owner worksheet.
// No network access, no dates guessed from wall-clock time inside these
// functions -- every caller passes "today" explicitly, so this file's
// behaviour is fully pinned by its tests.
//
// Sourced facts this file encodes (see README.md and the guide page for the
// full citations): New York's LLC Transparency Act (S8059, signed 2024-03-01,
// effective 2026-01-01). Following NYDOS's guidance confirmed 2025-12-31, the
// reporting obligation applies only to an LLC formed outside the United
// States that is also formed in NY or authorized to transact business in NY
// ("Reporting Company"); every other LLC with a NY nexus is an "Exempt
// Company" that still owes an Attestation of Exemption. LLCs formed/
// registered before 2026 file their initial disclosure or attestation by
// 2026-12-31; an LLC formed or registered on or after 2026-01-01 files
// within 30 days of that formation/registration date. Every LLC subject to
// the Act, reporting or exempt, also owes a recurring annual statement.
//
// This file never determines a filer's actual legal status -- it applies the
// filer's own answers to the rule above and says so. See index.html's
// disclaimer.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NYLTA_2026_TRANSITION = '2026-01-01';
const INITIAL_DEADLINE_FOR_PRE_2026_ENTITIES = '2026-12-31';
const THIRTY_DAY_WINDOW = 30;

/** Parse a YYYY-MM-DD string as a UTC midnight Date, or null if invalid. */
export function parseISODate(value) {
  if (!value || !DATE_RE.test(String(value))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

/** Whole days from `fromISO` to `toISO` (negative if `toISO` is earlier). */
export function daysBetween(fromISO, toISO_) {
  const from = parseISODate(fromISO);
  const to = parseISODate(toISO_);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function addDays(iso, days) {
  const date = parseISODate(iso);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

/**
 * Whether this LLC has any New York nexus at all: formed in New York, or
 * authorized/registered to transact business in New York. An LLC with
 * neither is outside the Act's scope regardless of where it was formed.
 */
export function hasNyNexus({ formedInNY, authorizedInNY }) {
  return Boolean(formedInNY) || Boolean(authorizedInNY);
}

/**
 * The filer's likely category under NYDOS's confirmed reading of the Act.
 * Returns one of:
 *   'outside-scope'    -- no NY nexus; the Act does not reach this LLC.
 *   'likely-reporting'  -- NY nexus, formed outside the US: expected to file
 *                          a Beneficial Ownership Disclosure.
 *   'likely-exempt'     -- NY nexus, formed inside the US (including NY):
 *                          expected to file an Attestation of Exemption,
 *                          not a full disclosure.
 * Never a determination -- callers must show the accompanying disclaimer.
 */
export function classify({ formedInNY, authorizedInNY, formedOutsideUS }) {
  if (!hasNyNexus({ formedInNY, authorizedInNY })) return 'outside-scope';
  return formedOutsideUS ? 'likely-reporting' : 'likely-exempt';
}

/**
 * The applicable initial-filing deadline for an LLC with a NY nexus.
 * `formationOrRegistrationDate` is when this LLC was formed (NY-formed) or
 * authorized/registered to transact business in NY (foreign LLC) --
 * whichever created the nexus. Returns null for invalid input.
 */
export function initialDeadline(formationOrRegistrationDate) {
  const date = parseISODate(formationOrRegistrationDate);
  if (!date) return null;
  if (formationOrRegistrationDate < NYLTA_2026_TRANSITION) {
    return INITIAL_DEADLINE_FOR_PRE_2026_ENTITIES;
  }
  return addDays(formationOrRegistrationDate, THIRTY_DAY_WINDOW);
}

/** Days remaining until `deadlineISO`, as of `todayISO` (negative if past). */
export function daysUntil(deadlineISO, todayISO) {
  return daysBetween(todayISO, deadlineISO);
}

const OWNER_FIELDS = [
  { key: 'name', label: 'Full legal name' },
  { key: 'address', label: 'Residential or business street address' },
  { key: 'dob', label: 'Date of birth' },
  { key: 'idType', label: 'ID type (passport, driver license, or other government ID)' },
  { key: 'idNumber', label: 'Unique ID number' },
  { key: 'idJurisdiction', label: 'Issuing state or country' },
];

export function emptyOwnerRow() {
  return Object.fromEntries(OWNER_FIELDS.map((f) => [f.key, '']));
}

/** Which required fields a beneficial-owner row is still missing. */
export function ownerRowIssues(row) {
  const r = row && typeof row === 'object' ? row : {};
  return OWNER_FIELDS.filter((f) => !String(r[f.key] || '').trim()).map((f) => f.label);
}

export function loadOwners(value) {
  if (!value) return [];
  try {
    const owners = JSON.parse(value);
    return Array.isArray(owners) ? owners.filter((o) => o && typeof o === 'object') : [];
  } catch {
    return [];
  }
}

export function removeOwner(owners, index) {
  if (!Array.isArray(owners)) return [];
  if (!Number.isInteger(index) || index < 0 || index >= owners.length) return owners.slice();
  return owners.filter((_, i) => i !== index);
}

const CLASSIFICATION_LABEL = {
  'outside-scope': 'Likely outside the Act’s scope',
  'likely-reporting': 'Likely a Reporting Company (Beneficial Ownership Disclosure)',
  'likely-exempt': 'Likely an Exempt Company (Attestation of Exemption)',
};

/**
 * A plain-text organizer summarizing the answers above, meant to be reviewed
 * and attached to the filer's own email -- this function never files
 * anything and never contacts New York State.
 */
export function buildOrganizerText({
  entityName,
  classification,
  formationOrRegistrationDate,
  deadline,
  todayISO,
  owners,
}) {
  const lines = [];
  lines.push('NY LLC Transparency Act -- filing organizer (draft, not a filing)');
  lines.push(`Prepared: ${todayISO || ''}`);
  lines.push('');
  lines.push(`Entity name: ${entityName || '(not entered)'}`);
  lines.push(`Category from your answers: ${CLASSIFICATION_LABEL[classification] || 'Not yet determined'}`);
  lines.push('This is not a determination of your actual filing status. Confirm directly with the NY Department of State or your own attorney before you rely on it.');
  lines.push('');
  lines.push(`Nexus/formation date used for the deadline: ${formationOrRegistrationDate || '(not entered)'}`);
  lines.push(`Applicable initial deadline: ${deadline || '(not yet computed)'}`);
  const remaining = deadline && todayISO ? daysUntil(deadline, todayISO) : null;
  if (remaining !== null) {
    lines.push(
      remaining >= 0
        ? `Days remaining as of ${todayISO}: ${remaining}`
        : `This deadline is ${Math.abs(remaining)} day(s) past as of ${todayISO}.`,
    );
  }
  lines.push('Every LLC subject to the Act, reporting or exempt, also owes a recurring annual statement in later years -- confirm your own annual due date with NYDOS.');
  lines.push('');
  if (classification === 'likely-reporting') {
    lines.push(`Beneficial owners recorded (${(owners || []).length}):`);
    (owners || []).forEach((owner, i) => {
      lines.push(`  ${i + 1}. ${owner.name || '(name not entered)'}`);
      for (const field of OWNER_FIELDS.slice(1)) {
        lines.push(`     ${field.label}: ${owner[field.key] || '(not entered)'}`);
      }
      const issues = ownerRowIssues(owner);
      if (issues.length) lines.push(`     MISSING: ${issues.join(', ')}`);
    });
  } else {
    lines.push('Beneficial-owner rows are not needed for an Attestation of Exemption -- shown here only if your own category answer changes.');
  }
  lines.push('');
  lines.push('This document was assembled entirely in your browser and has not been sent anywhere. Review it, then file it yourself with the NY Department of State.');
  return lines.join('\n');
}

export function ownerRowsToCsv(owners) {
  const header = OWNER_FIELDS.map((f) => f.label);
  const rows = (owners || []).map((owner) => OWNER_FIELDS.map((f) => String(owner[f.key] || '')));
  const escape = (cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

export { OWNER_FIELDS };
