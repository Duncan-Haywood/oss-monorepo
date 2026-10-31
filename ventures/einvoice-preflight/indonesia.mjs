// Indonesia taxpayer number (NPWP) shape helper for the Indonesia page. Pure
// function; the page imports it in the browser. Per the tax authority's
// article on Coretax (pajak.go.id, "Coretax DJP, Era NPWP 16 digit", read as a
// search excerpt only) the NPWP has 16 digits in Coretax: an individual who is
// a citizen uses the 16-digit population ID (NIK); a company or government
// body uses its old 15-digit NPWP with a 0 put in front. The old 15-digit form
// is conventionally written 99.999.999.9-999.999. No check digit is claimed
// here: none was found in a source, so only the shape is tested. Nothing is
// looked up, so a clean result says nothing about registration.

export function checkNpwp(raw) {
  const s = String(raw || "").trim().replace(/[\s.\-]/g, "");
  if (!/^\d+$/.test(s)) return { ok: false, npwp: s, problems: ["An NPWP is digits only (dots, dashes and spaces are ignored)."] };
  if (s.length === 15) return { ok: true, npwp: s, kind: "old 15-digit NPWP (Coretax writes it with a 0 in front)", problems: [] };
  if (s.length === 16) {
    if (s[0] === "0") return { ok: true, npwp: s, kind: "16-digit NPWP (0 + old 15-digit number)", problems: [] };
    return { ok: true, npwp: s, kind: "16-digit number (an individual's NIK; it works for tax only once matched and activated in Coretax)", problems: [] };
  }
  return { ok: false, npwp: s, problems: [`An NPWP has 15 or 16 digits; this has ${s.length}.`] };
}
