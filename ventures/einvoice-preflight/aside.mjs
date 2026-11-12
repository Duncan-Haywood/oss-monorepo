// Built-in INV-0xx rules that step aside for an invoice whose profile is not EU
// EN 16931: Peppol PINT (Singapore, Australia/New Zealand, Japan, Malaysia, the UAE,
// Oman) and Saudi Arabia's ZATCA. The built-in checks assume EU conventions (IBANs,
// BICs, EU VAT numbers, EU exemption reasons), so on these files they fire falsely and
// give fixes that are wrong for the seller ("use DE and nine digits" on a Japanese
// T-number). Read from the invoice's own BT-24 (CustomizationID) and UBL ProfileID, so
// it applies whether or not the official rules ran (the page's default route, the
// server API, and src/einvoice_preflight/aside.py, which mirrors this table and is
// compared with it by tests/test_js_parity.py).
//
// Each rule id was measured on OpenPeppol's and ZATCA's published examples
// (eval/phive-corpus.mjs, 2026-11-11 and 2026-11-12; README, "Current PINT releases").

// Older BIS-style PINT ids and the current urn:peppol:pint: ones.
const PINT = /poacc:(?:billing|selfbilling):international:(?:sg|aunz):|^\s*urn:peppol:pint:/i;
const PINT_LOCAL = /^\s*urn:peppol:pint:[a-z]+-1@(?:jp|my|ae|om)-1\b/i;
const PINT_JP_NTR = /^\s*urn:peppol:pint:nontaxinvoice-1@jp-1\b/i;
const PINT_AE = /^\s*urn:peppol:pint:[a-z]+-1@ae-1\b/i;
const ZATCA = /^\s*(?:reporting|clearance):1\.0\s*$/i;

export const ASIDE = {
  // A local bank account (not an IBAN), an Australian BSB or Singapore bank code in
  // the BIC field, Singapore's Z01 GIRO means code, GST categories ZR/NG/OS that need
  // no EU exemption reason.
  pint: ["INV-024", "INV-026", "INV-044", "INV-035"],
  // JP T-number, MY TIN, AE TRN, OM VATIN (not EU VAT numbers); a debit note is an
  // Invoice with code 383; the branch id's country is no IBAN's.
  local: ["INV-022", "INV-027", "INV-034"],
  // A seller not registered for Japan's consumption tax states a rate and charges none.
  jpNtr: ["INV-018", "INV-038"],
  // The UAE states 5% on a reverse-charge (AE) or margin-scheme (N) row and charges none.
  aeZeroAtRate: ["INV-018", "INV-038"],
  // A simplified (B2C) invoice names no buyer; notes are Invoices with 381/383; ZATCA's
  // cut of EN 16931 leaves out BR-33 (INV-052) and BR-61 (INV-045).
  zatca: ["INV-024", "INV-022", "INV-005", "INV-006", "INV-034", "INV-045", "INV-052"],
};

const zeroAtRate = (row) => ["AE", "N"].includes(String(row?.tax_category || "").toUpperCase()) && Number(row?.tax) === 0 && Number(row?.tax_percent) > 0;

export function steppedAside(invoice) {
  const spec = String(invoice?.specification_id || "");
  const profile = String(invoice?.profile_id || "");
  const out = new Set();
  const add = (ids) => ids.forEach((id) => out.add(id));
  if (PINT.test(spec)) add(ASIDE.pint);
  if (PINT_LOCAL.test(spec)) add(ASIDE.local);
  if (PINT_JP_NTR.test(spec)) add(ASIDE.jpNtr);
  if (PINT_AE.test(spec) && (invoice?.tax_breakdown || []).some(zeroAtRate)) add(ASIDE.aeZeroAtRate);
  if (ZATCA.test(profile)) add(ASIDE.zatca);
  return out;
}
