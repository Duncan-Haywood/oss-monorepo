// South Korean business registration number helper for the Korea page: shape
// and check digit. Pure function; the page imports it in the browser. The
// number has 10 digits (written 123-45-67890). Check: multiply the first nine
// digits by 1,3,7,1,3,7,1,3,5, add floor(ninth digit x 5 / 10) to the sum, and
// the tenth digit must equal (10 - sum mod 10) mod 10. That is the rule the
// python-stdnum library documents for kr.brn; it was not read from the
// National Tax Service's specification. Nothing here looks a number up.

const W = [1, 3, 7, 1, 3, 7, 1, 3, 5];

export function checkKoreanBrn(raw) {
  const s = String(raw || "").trim().replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(s)) return { ok: false, id: s, problems: ["A Korean business registration number has 10 digits (written 123-45-67890; spaces and hyphens are ignored)."] };
  const sum = W.reduce((a, w, i) => a + w * Number(s[i]), 0) + Math.floor((Number(s[8]) * 5) / 10);
  if ((10 - (sum % 10)) % 10 !== Number(s[9])) return { ok: false, id: s, problems: ["The check digit does not match: the weighted digit sum does not give the tenth digit."] };
  return { ok: true, id: s, formatted: `${s.slice(0, 3)}-${s.slice(3, 5)}-${s.slice(5)}`, problems: [] };
}
