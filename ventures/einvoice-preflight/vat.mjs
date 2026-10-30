// Offline VAT identifier shape and checksum observations.
// Typo catch only — not a VIES lookup and not a claim a party may charge tax.

const FORMAT_ONLY = {
  BG: [9, 10],
  CY: [9],
  CZ: [8, 9, 10],
  EE: [9],
  EL: [9],
  GR: [9],
  HR: [11],
  HU: [8],
  LT: [9, 12],
  LV: [11],
  MT: [8],
  RO: Array.from({ length: 9 }, (_, i) => i + 2),
  SI: [8],
  SK: [10],
  XI: [9, 12],
};

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function normalizeVat(value) {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact || null;
}

function esShape(body) {
  if (body.length !== 9) return false;
  if (/^\d/.test(body[0]) && /[A-Z]/.test(body[8]) && /^\d{7}$/.test(body.slice(1, 8))) return true;
  if (/[A-Z]/.test(body[0]) && /^\d{7}$/.test(body.slice(1, 8)) && /[A-Z0-9]/.test(body[8])) return true;
  return false;
}

function ieShape(body) {
  if (body.length === 8 && /^\d/.test(body[0]) && /[A-Z]/.test(body[7]) && /^[A-Z0-9]{6}$/.test(body.slice(1, 7))) {
    return true;
  }
  if (body.length === 9 && /^\d/.test(body[0]) && /[A-Z]/.test(body[7]) && /[A-Z]/.test(body[8]) && /^\d{6}$/.test(body.slice(1, 7))) {
    return true;
  }
  return false;
}

const digitsOf = (text) => [...text].map(Number);
const weighted = (text, weights) => digitsOf(text).reduce((sum, digit, i) => sum + digit * weights[i], 0);

// Checksums for countries that were shape-only. Each entry is tried only when
// `applies` matches the body, so a variant not implemented here (for example a
// 10-digit Bulgarian or 12-digit Lithuanian number) stays a shape check.
// Algorithms are the public ones (as in python-stdnum); each is exercised in
// vat.test.mjs on a published example number plus a one-digit mutation.
const MOD11_WEIGHTS = [1, 2, 3, 4, 5, 6, 7, 8];
const MOD11_RETRY = { LT: [3, 4, 5, 6, 7, 8, 9, 1], BG: [3, 4, 5, 6, 7, 8, 9, 10] };

function mod11Retry(body, retry) {
  let sum = weighted(body.slice(0, 8), MOD11_WEIGHTS) % 11;
  if (sum === 10) sum = weighted(body.slice(0, 8), retry) % 11;
  if (sum === 10) sum = 0;
  return sum === Number(body[8]);
}

const EXTRA_CHECKS = {
  EE: { applies: (b) => /^\d{9}$/.test(b), ok: (b) => b[0] === "1" && weighted(b, [3, 7, 1, 3, 7, 1, 3, 7, 1]) % 10 === 0 },
  HU: { applies: (b) => /^\d{8}$/.test(b), ok: (b) => weighted(b, [9, 7, 3, 1, 9, 7, 3, 1]) % 10 === 0 },
  SI: {
    applies: (b) => /^\d{8}$/.test(b),
    ok: (b) => {
      if (b[0] === "0") return false;
      let check = 11 - (weighted(b.slice(0, 7), [8, 7, 6, 5, 4, 3, 2]) % 11);
      if (check === 10) check = 0;
      return check === Number(b[7]);
    },
  },
  SK: { applies: (b) => /^\d{10}$/.test(b), ok: (b) => b[0] !== "0" && "234789".includes(b[2]) && Number(b) % 11 === 0 },
  HR: { applies: (b) => /^\d{11}$/.test(b), ok: (b) => deOkIso7064(b.slice(0, 10), Number(b[10])) },
  // Legal entities only (first digit 4-9); natural persons use a birth date.
  LV: { applies: (b) => /^[4-9]\d{10}$/.test(b), ok: (b) => weighted(b, [9, 1, 4, 8, 3, 10, 2, 5, 7, 6, 1]) % 11 === 3 },
  LT: { applies: (b) => /^\d{9}$/.test(b), ok: (b) => b[7] === "1" && mod11Retry(b, MOD11_RETRY.LT) },
  BG: { applies: (b) => /^\d{9}$/.test(b), ok: (b) => mod11Retry(b, MOD11_RETRY.BG) },
  RO: {
    applies: (b) => /^[1-9]\d{1,9}$/.test(b),
    ok: (b) => {
      const padded = b.padStart(10, "0");
      let check = (weighted(padded.slice(0, 9), [7, 5, 3, 2, 1, 7, 5, 3, 2]) * 10) % 11;
      if (check === 10) check = 0;
      return check === Number(padded[9]);
    },
  },
  EL: {
    applies: (b) => /^\d{9}$/.test(b),
    ok: (b) => {
      let total = 0;
      for (let i = 0; i < 8; i += 1) total += Number(b[i]) * 2 ** (8 - i);
      return (total % 11) % 10 === Number(b[8]);
    },
  },
  // 8-digit legal entities only; 9- and 10-digit numbers (individuals) stay shape-only.
  CZ: {
    applies: (b) => /^[0-8]\d{7}$/.test(b),
    ok: (b) => {
      let check = 11 - (weighted(b.slice(0, 7), [8, 7, 6, 5, 4, 3, 2]) % 11);
      if (check === 10) check = 0;
      if (check === 11) check = 1;
      return check === Number(b[7]);
    },
  },
};
EXTRA_CHECKS.GR = EXTRA_CHECKS.EL;

function deOkIso7064(first, check) {
  let product = 10;
  for (const char of first) {
    let step = (Number(char) + product) % 10;
    if (step === 0) step = 10;
    product = (2 * step) % 11;
  }
  return (11 - product) % 10 === check;
}

function classify(country, body) {
  if (country === "DE") return /^\d{9}$/.test(body) ? "checksum" : "bad-format";
  if (country === "FR") return body.length === 11 && /^\d+$/.test(body.slice(2)) ? "checksum" : "bad-format";
  if (country === "BE") {
    const digits = body[0] === "0" && body.length === 11 ? body.slice(1) : body;
    return /^\d+$/.test(digits) && (digits.length === 9 || digits.length === 10) ? "checksum" : "bad-format";
  }
  if (country === "NL") {
    return body.length === 12 && body[9] === "B" && /^\d{9}$/.test(body.slice(0, 9)) && /^\d{2}$/.test(body.slice(10))
      ? "checksum"
      : "bad-format";
  }
  if (country === "AT") return body.startsWith("U") && body.length === 9 && /^\d{8}$/.test(body.slice(1)) ? "checksum" : "bad-format";
  if (country === "IT") return /^\d{11}$/.test(body) ? "checksum" : "bad-format";
  if (country === "ES") return esShape(body) ? "checksum" : "bad-format";
  if (country === "PL") return /^\d{10}$/.test(body) ? "checksum" : "bad-format";
  if (country === "SE") return /^\d+$/.test(body) && (body.length === 10 || body.length === 12) ? "checksum" : "bad-format";
  if (country === "DK") return /^\d{8}$/.test(body) ? "checksum" : "bad-format";
  if (country === "FI") return /^\d{8}$/.test(body) ? "checksum" : "bad-format";
  if (country === "PT") return /^\d{9}$/.test(body) ? "checksum" : "bad-format";
  if (country === "LU") return /^\d{8}$/.test(body) ? "checksum" : "bad-format";
  if (country === "IE") return ieShape(body) ? "checksum" : "bad-format";
  if (country === "GB" || country === "UK") return /^\d+$/.test(body) && (body.length === 9 || body.length === 12) ? "checksum" : "bad-format";
  const lengths = FORMAT_ONLY[country];
  if (lengths === undefined) return "unknown";
  if (EXTRA_CHECKS[country]?.applies(body)) return "checksum";
  if (/^[A-Z0-9]+$/.test(body) && lengths.includes(body.length)) return "format";
  return "bad-format";
}

function deOk(digits) {
  let product = 10;
  for (const char of digits.slice(0, 8)) {
    let step = (Number(char) + product) % 10;
    if (step === 0) step = 10;
    product = (2 * step) % 11;
  }
  return (11 - product) % 10 === Number(digits[8]);
}

function frOk(body) {
  const siren = body.slice(2);
  if (!/^\d+$/.test(siren)) return false;
  const key = body.slice(0, 2);
  if (!/^\d+$/.test(key)) return true;
  const expected = (12 + 3 * (Number(siren) % 97)) % 97;
  return Number(key) === expected;
}

function beOk(body) {
  let digits = body.startsWith("0") && body.length === 11 ? body.slice(1) : body;
  if (digits.length === 9) digits = `0${digits}`;
  if (digits.length !== 10 || !/^\d+$/.test(digits)) return false;
  return (Number(digits.slice(0, 8)) % 97 + Number(digits.slice(8))) % 97 === 0;
}

// Elfproef (11-proof): the same mod-11 checksum the Dutch government uses
// for a BSN/RSIN, which is where the 9 digits of a legacy company VAT
// number come from. Weights 9..2 on the first eight digits, then the ninth
// (check) digit at weight -1 — not +1. The prior version added the check
// digit instead of subtracting it, which is off by 2x the check digit from
// the real elfproef: it fails real valid Dutch VAT numbers (e.g. the
// standard NL123456782B01 test number) and, just as quietly, calls some
// typo'd numbers valid. A preflight tool whose one job is catching a typo'd
// VAT number before the invoice goes out cannot get its own arithmetic
// backwards on the most common EU country in this list.
function nlOk(body) {
  let total = 0;
  for (let i = 0; i < 8; i += 1) total += Number(body[i]) * (9 - i);
  total -= Number(body[8]);
  return total % 11 === 0;
}

function atOk(body) {
  const digits = [...body.slice(1)].map(Number);
  let total = 0;
  for (let index = 0; index < 7; index += 1) {
    const value = index % 2 === 0 ? digits[index] : digits[index] * 2;
    total += value < 10 ? value : value - 9;
  }
  const check = (10 - ((total + 4) % 10)) % 10;
  return check === digits[7];
}

function itOk(digits) {
  let total = 0;
  for (let index = 0; index < 10; index += 1) {
    let value = Number(digits[index]);
    if (index % 2 === 1) {
      value *= 2;
      value = Math.floor(value / 10) + (value % 10);
    }
    total += value;
  }
  return (10 - (total % 10)) % 10 === Number(digits[10]);
}

function esOk(body) {
  const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
  if (/^\d/.test(body[0]) && /[A-Z]/.test(body[8])) {
    return body[8] === letters[Number(body.slice(0, 8)) % 23];
  }
  if (!/^[A-Z]/.test(body[0]) || !/^\d{7}$/.test(body.slice(1, 8))) return false;
  let total = 0;
  for (let index = 0; index < 7; index += 1) {
    const value = Number(body[index + 1]) * (index % 2 === 0 ? 2 : 1);
    total += Math.floor(value / 10) + (value % 10);
  }
  const check = (10 - (total % 10)) % 10;
  const control = body[8];
  const letterControls = "JABCDEFGHI";
  if ("KLMNPQRSW".includes(body[0])) return control === letterControls[check];
  if ("ABEH".includes(body[0])) return control === String(check);
  return control === String(check) || control === letterControls[check];
}

function plOk(digits) {
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let total = 0;
  for (let i = 0; i < 9; i += 1) total += Number(digits[i]) * weights[i];
  const check = total % 11;
  return check !== 10 && check === Number(digits[9]);
}

function luhnOk(digits) {
  let total = 0;
  const reverse = [...digits].reverse();
  reverse.forEach((char, index) => {
    let value = Number(char);
    if (index % 2 === 1) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    total += value;
  });
  return total % 10 === 0;
}

function seOk(digits) {
  const org = digits.slice(0, 10);
  return luhnOk(org) && (digits.length === 10 || digits.slice(10) === "01");
}

function dkOk(digits) {
  const weights = [2, 7, 6, 5, 4, 3, 2, 1];
  let total = 0;
  for (let i = 0; i < 8; i += 1) total += Number(digits[i]) * weights[i];
  return total % 11 === 0;
}

function fiOk(digits) {
  const weights = [7, 9, 10, 5, 8, 4, 2];
  let total = 0;
  for (let i = 0; i < 7; i += 1) total += Number(digits[i]) * weights[i];
  const remainder = total % 11;
  if (remainder === 1) return false;
  const check = remainder === 0 ? 0 : 11 - remainder;
  return check === Number(digits[7]);
}

function ptOk(digits) {
  const weights = [9, 8, 7, 6, 5, 4, 3, 2];
  let total = 0;
  for (let i = 0; i < 8; i += 1) total += Number(digits[i]) * weights[i];
  const remainder = 11 - (total % 11);
  const check = remainder >= 10 ? 0 : remainder;
  return check === Number(digits[8]);
}

function luOk(digits) {
  return Number(digits.slice(0, 6)) % 89 === Number(digits.slice(6));
}

function ieOk(body) {
  const alphabet = "WABCDEFGHIJKLMNOPQRSTUV";
  if (body.length === 8) {
    // Two 8-character shapes share this branch. The common one is 7 digits
    // plus a check letter, weighed as-is. The older one (digit, letter,
    // 5 digits, check letter -- e.g. the legacy "8Z49289F" shape) cannot be
    // weighed as typed: Revenue's own check-digit definition first
    // rearranges it to "0" + the middle 5 digits + the leading digit before
    // applying the same mod-23 weights. The prior version instead spliced a
    // literal "7" in for the letter and left the leading digit in place --
    // it never moved anything, so it was computing a checksum for a number
    // that was not the one on the invoice. Every valid legacy-format Irish
    // VAT number failed this check, silently: it read as a typo the same
    // way a correctly-typed one would.
    const source = /^\d$/.test(body[1]) ? body.slice(0, 7) : `0${body.slice(2, 7)}${body[0]}`;
    if (!/^\d{7}$/.test(source)) return false;
    let total = 0;
    for (let index = 0; index < 7; index += 1) {
      total += Number(source[index]) * (8 - index);
    }
    return body[7] === alphabet[total % 23];
  }
  if (body.length === 9 && /^\d{7}$/.test(body.slice(0, 7))) {
    const extra = alphabet.indexOf(body[8]);
    if (extra < 0) return false;
    let total = extra * 9;
    for (let i = 0; i < 7; i += 1) total += Number(body[i]) * (8 - i);
    return body[7] === alphabet[total % 23];
  }
  return false;
}

function gbOk(digits) {
  if (digits.length !== 9 && digits.length !== 12) return false;
  if (digits.length === 12 && digits.slice(9) !== "000") return false;
  const weights = [8, 7, 6, 5, 4, 3, 2];
  let total = 0;
  for (let i = 0; i < 7; i += 1) total += Number(digits[i]) * weights[i];
  const check = Number(digits.slice(7, 9));
  return (total + check) % 97 === 0 || (total + 55 + check) % 97 === 0;
}

function checksumOk(country, body) {
  if (country === "DE") return deOk(body);
  if (country === "FR") return frOk(body);
  if (country === "BE") return beOk(body);
  if (country === "NL") return nlOk(body);
  if (country === "AT") return atOk(body);
  if (country === "IT") return itOk(body);
  if (country === "ES") return esOk(body);
  if (country === "PL") return plOk(body);
  if (country === "SE") return seOk(body);
  if (country === "DK") return dkOk(body);
  if (country === "FI") return fiOk(body);
  if (country === "PT") return ptOk(body);
  if (country === "LU") return luOk(body);
  if (country === "IE") return ieOk(body);
  if (country === "GB" || country === "UK") return gbOk(body);
  if (EXTRA_CHECKS[country]) return EXTRA_CHECKS[country].ok(body);
  return false;
}

export function looksLikeCompleteVat(value) {
  const compact = normalizeVat(value);
  if (compact === null || compact.length < 4) return false;
  const country = compact.slice(0, 2);
  const body = compact.slice(2);
  if (!/^[A-Z]{2}$/.test(country)) return false;
  const kind = classify(country, body);
  return kind === "checksum" || kind === "format";
}

function evaluate(country, body, path, partyName, requireKnown) {
  const kind = classify(country, body);
  const label = partyName.charAt(0).toUpperCase() + partyName.slice(1);
  if (kind === "unknown") {
    if (!requireKnown) return [];
    return [finding(
      "INV-022",
      `${label} VAT identifier uses an unrecognized country prefix.`,
      "Use an EU, UK, or other published VAT country prefix, or omit vat_id for an internal id.",
      path,
    )];
  }
  if (kind === "bad-format") {
    return [finding(
      "INV-022",
      `${label} VAT identifier does not match the published ${country} shape.`,
      `Correct the ${country} VAT identifier length and characters, or use an internal id without a country prefix.`,
      path,
    )];
  }
  if (kind === "checksum" && !checksumOk(country, body)) {
    return [finding(
      "INV-023",
      `${label} VAT identifier fails the published ${country} checksum.`,
      `Correct the ${country} VAT identifier digits. This is a checksum typo check, not a registration lookup.`,
      path,
    )];
  }
  return [];
}

function checkExplicit(value, path, partyName) {
  const label = partyName.charAt(0).toUpperCase() + partyName.slice(1);
  if (typeof value !== "string" || !value.trim()) {
    return [finding(
      "INV-022",
      `${label} VAT identifier is empty or not text.`,
      "Provide the VAT identifier as text, or omit vat_id.",
      path,
    )];
  }
  const compact = normalizeVat(value);
  if (compact === null || compact.length < 4 || !/^[A-Z]{2}/.test(compact)) {
    return [finding(
      "INV-022",
      `${label} VAT identifier is not a country-prefixed VAT number.`,
      "Use a two-letter country prefix plus the national number, for example DE and nine digits.",
      path,
    )];
  }
  return evaluate(compact.slice(0, 2), compact.slice(2), path, partyName, true);
}

function checkComplete(value, path, partyName) {
  const compact = normalizeVat(value);
  if (compact === null) return [];
  return evaluate(compact.slice(0, 2), compact.slice(2), path, partyName, false);
}

export function inspectPartyVat(party, partyName) {
  if (!party || typeof party !== "object" || Array.isArray(party)) return [];
  const findings = [];
  const checked = new Set();
  const vatId = party.vat_id;
  if (vatId !== undefined && vatId !== null && vatId !== "") {
    findings.push(...checkExplicit(vatId, `/${partyName}/vat_id`, partyName));
    const compact = normalizeVat(vatId);
    if (compact) checked.add(compact);
  }
  const identifier = party.id;
  const compactId = normalizeVat(identifier);
  if (compactId && !checked.has(compactId) && looksLikeCompleteVat(identifier)) {
    findings.push(...checkComplete(identifier, `/${partyName}/id`, partyName));
  }
  return findings;
}
