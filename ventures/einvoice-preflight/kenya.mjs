// Kenya Revenue Authority PIN helper for the Kenya page: shape only. A PIN is
// reported (secondary guides, not KRA's own text) as 11 characters: an upper-
// case letter (A for an individual, P for a company or other non-individual),
// nine digits and an uppercase letter. No public check-digit rule was found,
// so this tests shape and the first letter, nothing more. Nothing here looks a
// PIN up; KRA's iTax PIN checker is the place for that.

export function checkKraPin(raw) {
  const s = String(raw || "").trim().replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]\d{9}[A-Z]$/.test(s)) return { ok: false, id: s, problems: ["A KRA PIN has 11 characters: a letter, nine digits and a letter (for example A123456789Z; spaces and hyphens are ignored)."] };
  if (s[0] !== "A" && s[0] !== "P") return { ok: false, id: s, problems: ["Guides report PINs starting with A (individuals) or P (companies and other non-individuals); this one starts with another letter."] };
  return { ok: true, id: s, kind: s[0] === "A" ? "individual" : "non-individual", problems: [] };
}
