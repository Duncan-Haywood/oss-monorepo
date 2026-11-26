// Vietnam tax code (mã số thuế, MST) helpers for the Vietnam page: shape and
// check digit. Pure functions; the Vietnam page imports this file in the
// browser. A business MST is 10 digits: two for the province, seven serial
// digits and a check digit; a branch adds a hyphen and 3 digits (13 in all)
// and the first 10 must themselves be valid. Weights 31,29,23,19,17,13,7,5,3
// over the first nine digits, check digit = 10 - (sum mod 11); that is the
// rule python-stdnum documents (its vn.mst module) and it reproduces that
// module's example 0100233488 by hand (sum 167, 167 mod 11 = 2, digit 8). It
// was not read from the tax authority's specification. When the remainder is
// 0 the formula gives 10, which is not a digit, so no check digit fits those
// nine digits and the number is reported as invalid. A 12-digit number is the
// citizen ID (CCCD) that, per vendor guides, individuals use as their tax
// code from 1 July 2025; it has no check digit here, only its length is
// tested. Nothing here looks a number up.

const W = [31, 29, 23, 19, 17, 13, 7, 5, 3];

export function checkDigit(first9) {
  const s = [...first9].reduce((a, d, i) => a + Number(d) * W[i], 0);
  const r = s % 11;
  return r === 0 ? null : String(10 - r);
}

export function checkMst(raw) {
  const s = String(raw || "").trim().replace(/[\s.]/g, "");
  if (/^\d{12}$/.test(s)) return { ok: true, mst: s, kind: "citizen ID (12 digits, length only)", problems: [] };
  const m = s.match(/^(\d{10})(?:-?(\d{3}))?$/);
  if (!m) return { ok: false, mst: s, problems: ["A Vietnamese tax code has 10 digits (13 for a branch, written 0100233488-001) or, for an individual, 12."] };
  const want = checkDigit(m[1].slice(0, 9));
  if (want === null) return { ok: false, mst: s, problems: ["No check digit fits the first nine digits (the sum is a multiple of 11), so this is not a valid tax code."] };
  if (m[1][9] !== want) return { ok: false, mst: s, problems: [`The tenth digit should be ${want}, not ${m[1][9]}.`] };
  if (m[2] === "000") return { ok: false, mst: s, problems: ["A branch suffix is 001 to 999."] };
  return { ok: true, mst: s, kind: m[2] ? "branch" : "business", problems: [] };
}
