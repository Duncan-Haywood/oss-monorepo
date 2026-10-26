// Japan Qualified Invoice System helpers: registration number shape and the
// corporate-number check digit. Pure functions; the Japan page imports this
// file in the browser.
// The check digit is the corporate-number rule (9 minus the weighted sum of the
// twelve digits to its right, weights 1 and 2 from the right, mod 9). It was
// pinned on the tax agency's own number, 7000012050002, in japan.test.mjs; it
// was not read from the agency's specification. A registration number issued
// to an individual is not a corporate number, so a mismatch there may not be a
// typo: the result says so rather than calling the number wrong.

export function corporateCheckDigit(base12) {
  let sum = 0;
  for (let n = 1; n <= 12; n++) sum += Number(base12[12 - n]) * (n % 2 ? 1 : 2);
  return 9 - (sum % 9);
}

// Returns { ok, number, kind, problems: [...] }. kind is "corporate" when the
// check digit fits, "other" when it does not (individual, or a typo).
export function checkRegistrationNumber(raw) {
  const s = String(raw || "").trim().toUpperCase().replace(/[\s-]/g, "").replace(/^Ｔ/, "T");
  const digits = s.replace(/^T/, "");
  const problems = [];
  if (!s.startsWith("T")) problems.push("A registration number starts with the letter T.");
  if (!/^[0-9]*$/.test(digits)) problems.push("After the T there should be digits only.");
  else if (digits.length !== 13) problems.push(`After the T there should be 13 digits; this has ${digits.length}.`);
  if (problems.length) return { ok: false, number: s, kind: null, problems };
  const want = corporateCheckDigit(digits.slice(1));
  if (Number(digits[0]) === want) return { ok: true, number: `T${digits}`, kind: "corporate", problems: [] };
  return {
    ok: true,
    number: `T${digits}`,
    kind: "other",
    problems: [`The first digit would be ${want} for a corporate number, not ${digits[0]}. Either a digit is mistyped, or this is an individual's registration number, which is not a corporate number. Look it up on the tax agency's registrant site to be sure.`],
  };
}

// The credit a buyer may claim on a purchase from a seller with no
// registration number, as a share, by purchase date, under the transitional
// measure as vendor guides report it (80% to 30 Sep 2026, 50% to 30 Sep 2029).
// Revisions in the 2026 tax reform are not applied. null = outside the measure.
export function transitionalShare(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || "")) return null;
  if (isoDate < "2023-10-01") return null;
  if (isoDate <= "2026-09-30") return 0.8;
  if (isoDate <= "2029-09-30") return 0.5;
  return 0;
}
