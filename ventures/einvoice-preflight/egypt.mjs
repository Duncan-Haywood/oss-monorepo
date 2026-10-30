// Egyptian Tax Authority tax registration number helper for the Egypt page:
// shape only. Secondary guides (lookuptax.com, GS1 Egypt) report nine digits,
// often written XXX-XXX-XXX. No public check-digit rule was found, so this
// tests the shape and nothing more. Nothing here looks a number up.

export function checkEgyptTrn(raw) {
  const s = String(raw || "").trim().replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(s)) return { ok: false, id: s, problems: ["An Egyptian tax registration number has nine digits (for example 123-456-789; spaces and hyphens are ignored)."] };
  if (/^0+$/.test(s)) return { ok: false, id: s, problems: ["All zeros is not a registration number (guides use a placeholder for unregistered B2C buyers; this page does not check it)."] };
  return { ok: true, id: s, problems: [] };
}
