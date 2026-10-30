// Mexico RFC helpers for the CFDI page: shape, date part and check digit.
// Pure functions; the Mexico page imports this file in the browser.
// The check digit (last character of the homoclave) is mod 11 over the first
// twelve positions (a company's 11 letters and digits get a leading space),
// weights 13 down to 2, on the alphabet below; 11 gives 0 and 10 gives A. It
// was pinned in mexico.test.mjs on four RFCs I know (SAT970701NN3, GODE561231GR8,
// CACX7605101P8, XEXX010101000); it was not read from SAT's specification.
// The generic RFCs XAXX010101000 (public in general) and XEXX010101000
// (foreigners) are placeholders and are accepted by shape without a digit test.

const ALPHABET = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ";
export const GENERIC = new Set(["XAXX010101000", "XEXX010101000"]);

export function checkDigit(rfcWithoutDigit) {
  const s = rfcWithoutDigit.length === 11 ? " " + rfcWithoutDigit : rfcWithoutDigit;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += ALPHABET.indexOf(s[i]) * (13 - i);
  const m = 11 - (sum % 11);
  return m === 11 ? "0" : m === 10 ? "A" : String(m);
}

function validDate(yy, mm, dd) {
  if (mm < 1 || mm > 12 || dd < 1) return false;
  // the year is two digits, so 29 February is allowed (leap or not is unknown)
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  return dd <= days;
}

// Returns { ok, rfc, kind, problems }. kind: "company" (12), "person" (13),
// "generic", or null. A bad check digit gives ok false.
export function checkRfc(raw) {
  const s = String(raw || "").trim().toUpperCase().replace(/[\s-]/g, "");
  const problems = [];
  if (GENERIC.has(s)) return { ok: true, rfc: s, kind: "generic", problems: [] };
  if (s.length !== 12 && s.length !== 13) {
    return { ok: false, rfc: s, kind: null, problems: [`An RFC has 12 characters (company) or 13 (person); this has ${s.length}.`] };
  }
  const letters = s.length - 9;
  const head = s.slice(0, letters), date = s.slice(letters, letters + 6), home = s.slice(letters + 6);
  if (!/^[A-ZÑ&]+$/.test(head)) problems.push(`The first ${letters} characters should be letters (Ñ and & allowed).`);
  if (!/^\d{6}$/.test(date)) problems.push("After the letters there should be six digits, the date as YYMMDD.");
  else if (!validDate(+date.slice(0, 2), +date.slice(2, 4), +date.slice(4, 6))) problems.push(`The date part ${date} is not a possible YYMMDD.`);
  if (!/^[A-Z0-9]{2}[0-9A]$/.test(home)) problems.push("The last three characters (homoclave) should be two letters or digits and a digit or A.");
  if (problems.length) return { ok: false, rfc: s, kind: null, problems };
  const want = checkDigit(s.slice(0, -1));
  if (want !== s.at(-1)) {
    return { ok: false, rfc: s, kind: s.length === 12 ? "company" : "person", problems: [`The check digit should be ${want}, not ${s.at(-1)}: a character in this RFC is probably mistyped.`] };
  }
  return { ok: true, rfc: s, kind: s.length === 12 ? "company" : "person", problems: [] };
}
