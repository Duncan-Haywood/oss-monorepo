// Israeli business and personal ID helpers for the Israel page: shape and
// check digit. Pure functions; the Israel page imports this file in the
// browser. The ID (mispar zehut) of a person and the number of a company or
// partnership (starts with 5, e.g. 51 for a private company) and an
// authorised dealer's number are up to 9 digits, padded with leading zeros to
// 9. Check: multiply the digits by 1,2,1,2,... from the left, add the digits
// of each product, and the total must be a multiple of 10. That is the rule
// python-stdnum documents for its il.idnr module; it reproduces the number
// 000000018 by hand (0..0, 1x2 = 2, 8x1 = 8, total 10). It was not read from
// the Israel Tax Authority's specification. Nothing here looks a number up.

export function checkIsraeliId(raw) {
  const s = String(raw || "").trim().replace(/[\s-]/g, "");
  if (!/^\d{5,9}$/.test(s)) return { ok: false, id: s, problems: ["An Israeli ID or company number has 5 to 9 digits (shorter ones are padded with leading zeros to 9)."] };
  const id = s.padStart(9, "0");
  const total = [...id].reduce((a, d, i) => {
    const p = Number(d) * (i % 2 === 0 ? 1 : 2);
    return a + (p > 9 ? p - 9 : p);
  }, 0);
  if (total % 10 !== 0) return { ok: false, id, problems: ["The check digit does not match: the weighted digit sum is not a multiple of 10."] };
  return { ok: true, id, kind: id.startsWith("5") ? "company or partnership number (starts with 5)" : "personal ID or dealer number", problems: [] };
}
