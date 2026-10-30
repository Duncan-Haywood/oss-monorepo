// Turkish tax identifier helper for the Turkey page. VKN is the 10-digit tax
// number of a company or sole trader; TCKN is the 11-digit national ID an
// individual uses. Both check-digit rules are the widely published ones
// (secondary sources and open-source validators, not GIB's own text). A pass
// means the digits are consistent, not that GIB has the number on file.

export function checkVkn(raw) {
  const s = String(raw || "").replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(s)) return { ok: false, id: s, problems: ["A VKN (vergi kimlik numarası) has 10 digits."] };
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const t = (Number(s[i]) + 9 - i) % 10;
    let v = (t * 2 ** (9 - i)) % 9;
    if (t !== 0 && v === 0) v = 9;
    sum += v;
  }
  const want = (10 - (sum % 10)) % 10;
  if (want !== Number(s[9])) return { ok: false, id: s, problems: [`The last digit does not match the other nine (expected ${want}); a digit is probably mistyped.`] };
  return { ok: true, id: s, kind: "VKN", problems: [] };
}

export function checkTckn(raw) {
  const s = String(raw || "").replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(s)) return { ok: false, id: s, problems: ["A TCKN (T.C. kimlik numarası) has 11 digits."] };
  if (s[0] === "0") return { ok: false, id: s, problems: ["A TCKN cannot start with 0."] };
  const d = [...s].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== d[9]) return { ok: false, id: s, problems: ["The tenth digit does not match the first nine; a digit is probably mistyped."] };
  if (d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 !== d[10]) return { ok: false, id: s, problems: ["The last digit does not match the first ten; a digit is probably mistyped."] };
  return { ok: true, id: s, kind: "TCKN", problems: [] };
}

export function checkTurkishTaxId(raw) {
  const s = String(raw || "").replace(/[\s-]/g, "");
  return s.length === 11 ? checkTckn(s) : checkVkn(s);
}
