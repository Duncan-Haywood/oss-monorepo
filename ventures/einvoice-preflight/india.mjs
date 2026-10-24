// India GST e-invoice helpers: GSTIN check, document-number rule, IRN hash.
// Pure functions; the India mandate page imports this file in the browser.
// The IRN recipe (SHA-256 of GSTIN + financial year + document type + number)
// is from secondary guides and one worked sample, pinned in india.test.mjs;
// it is not read from the IRP specification.

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STATE_CODES = new Set([
  ...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, "0")), "97", "99",
]);
export const DOC_TYPES = ["INV", "CRN", "DBN"];

export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = ALPHABET.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36];
}

// Returns { ok, problems: [...] }. Shape and check character only: it cannot
// know whether the number is registered or active.
export function checkGstin(raw) {
  const g = String(raw || "").trim().toUpperCase();
  const problems = [];
  if (g.length !== 15) return { ok: false, gstin: g, problems: [`A GSTIN has 15 characters; this has ${g.length}.`] };
  if (!STATE_CODES.has(g.slice(0, 2))) problems.push(`State code ${g.slice(0, 2)} is not a GST state or union territory code.`);
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(g.slice(2, 12))) problems.push("Characters 3 to 12 should be a PAN: five letters, four digits, one letter.");
  if (!/^[1-9A-Z]$/.test(g[12])) problems.push("Character 13 (registration count for the PAN) should be 1-9 or a letter.");
  if (g[13] !== "Z") problems.push("Character 14 should be Z.");
  if (/^[0-9A-Z]{14}$/.test(g.slice(0, 14)) && gstinCheckChar(g.slice(0, 14)) !== g[14]) {
    problems.push(`Check character should be ${gstinCheckChar(g.slice(0, 14))}, not ${g[14]}: a typo in one of the other characters is likely.`);
  }
  return { ok: problems.length === 0, gstin: g, problems };
}

export function checkDocumentNumber(raw) {
  const n = String(raw || "");
  const problems = [];
  if (!n) problems.push("Enter a document number.");
  else {
    if (n.length > 16) problems.push(`Up to 16 characters are allowed; this has ${n.length}.`);
    if (/[^A-Za-z0-9/-]/.test(n)) problems.push("Only letters, digits, / and - are allowed.");
    if (/^[0/-]/.test(n)) problems.push("It cannot start with 0, / or -.");
  }
  return { ok: problems.length === 0, problems };
}

// Indian financial year (April to March) of an ISO date, as "2025-26".
export function financialYear(isoDate) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate || "");
  if (!m) return null;
  const y = Number(m[1]) - (Number(m[2]) < 4 ? 1 : 0);
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export async function irn({ gstin, financialYear: fy, docType, docNumber }) {
  const text = `${String(gstin).toUpperCase()}${fy}${docType}${docNumber}`;
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
