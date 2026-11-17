// The national band for a Brazilian ISS (ISSQN) rate, shared by the ABRASF (ABR-024) and
// national NFS-e (NFSE-024) checkers. Read from Lei Complementar 116/2003 as amended (text
// from a mirror of planalto.gov.br, which did not answer from the build host):
//   art. 8, II: the maximum rate is 5%;
//   art. 8-A (LC 157/2016): the minimum rate is 2%; § 1: no exemption, incentive, base
//     reduction, presumed credit "or any other form" may bring the burden below 2%,
//     except for list subitems 7.02 and 7.05 (construction) and 16.01 (municipal public
//     passenger transport); § 2: a municipal law or act that does not respect the minimum
//     is void where the buyer or intermediary is in another municipality; § 3: the provider
//     may reclaim ISS paid under it; art. 3, § 4 moves the tax to the buyer's municipality;
//   art. 8-B (LC 214/2025): for events in 2029, 2030, 2031 and 2032 the municipal rates in
//     force on 31 December 2028 are cut by 10%, 20%, 30% and 40%. This module scales both
//     ends of the band by the same factor (2029: 1.8% to 4.5%), which is this tool's reading:
//     the article cuts each municipal rate, so a rate that sat in the band in 2028 lands in
//     the scaled band. From 2033 ISS is replaced by IBS (EC 132/2023), so no band is applied.
// A rate below the band from a Simples Nacional or MEI provider, a fixed-amount regime
// (sociedade de profissionais, MEI) or a file whose ISS is not due (export, immunity,
// exemption, suspension) is not judged: the caller skips those and says so.
// An offline observation, not tax advice.

export const ISS_MIN = 2, ISS_MAX = 5;
export const EXEMPT_ITEMS = new Set(["7.02", "7.05", "16.01"]);
const CUT = { 2029: 0.1, 2030: 0.2, 2031: 0.3, 2032: 0.4 };

/** The LC 116 list subitem ("7.02") from an ABRASF ItemListaServico ("07.02", "0702", "702", "7.02")
 *  or a national cTribNac ("070201": item, subitem, then a national breakdown). null if unreadable. */
export function lcSubitem(code, national = false) {
  const s = String(code ?? "").trim();
  if (!s) return null;
  if (national) {
    if (!/^\d{6}$/.test(s)) return null;
    return `${Number(s.slice(0, 2))}.${s.slice(2, 4)}`;
  }
  let m = /^(\d{1,2})\.(\d{1,2})/.exec(s);
  if (m) return `${Number(m[1])}.${m[2].padStart(2, "0")}`;
  m = /^(\d{3,4})$/.exec(s);
  if (m) { const d = m[1].padStart(4, "0"); return `${Number(d.slice(0, 2))}.${d.slice(2)}`; }
  return null;
}

/** The band [min, max] in percent for a competence year, or null from 2033 (ISS replaced). */
export function issBand(year) {
  const y = Number(year);
  if (Number.isFinite(y) && y >= 2033) return null;
  const f = 1 - (CUT[y] || 0);
  const r = (x) => Math.round(x * f * 1000) / 1000;
  return { min: r(ISS_MIN), max: r(ISS_MAX), cut: CUT[y] || 0 };
}

const pct = (x) => `${Number(x.toFixed(3))}%`;

/**
 * Judge a stated ISS rate against the band.
 *   rate:   the stated rate as written (a percentage, "5.00"; or a fraction, "0.05", when fraction
 *           is true or the value is under 1 and the layout is ambiguous: both readings are tried)
 *   item:   the LC 116 subitem from lcSubitem(), or null
 *   year:   the competence year (dCompet / Competencia / DataEmissao), or NaN
 * Returns null when the rate fits (or is zero or unreadable), else {kind: "high"|"low", message, fix}.
 */
export function issRateProblem({ rate, item = null, year = NaN, fraction = "maybe" }) {
  const a = Number(String(rate ?? "").trim());
  if (!String(rate ?? "").trim() || !Number.isFinite(a) || a <= 0) return null;
  const band = issBand(year);
  if (!band) return null;
  const readings = fraction === true ? [a * 100] : fraction === false || a >= 1 ? [a] : [a, a * 100];
  const eps = 1e-9;
  const exempt = item && EXEMPT_ITEMS.has(item);
  const fits = (p) => p <= band.max + eps && (exempt || p >= band.min - eps);
  if (readings.some(fits)) return null;
  const shown = readings.length > 1 ? `${rate} (read as ${pct(readings[0])} or ${pct(readings[1])})` : `${rate} (${pct(readings[0])})`;
  const yearNote = band.cut ? ` For ${year}, LC 116 art. 8-B (LC 214/2025) cuts municipal rates by ${pct(band.cut * 100)}, so this tool scales the band to ${pct(band.min)}-${pct(band.max)}.` : "";
  if (readings.every((p) => p > band.max + eps)) {
    return { kind: "high", message: `The ISS rate is ${shown}, above the national maximum of ${pct(band.max)} (LC 116/2003 art. 8, II).${yearNote}`, fix: "Check the rate in the municipality's ISS law for this service; no municipality may charge more than 5%. A 1.00 layout writes the rate as a fraction (0.05), a 2.x layout as a percentage (5.00)." };
  }
  return { kind: "low", message: `The ISS rate is ${shown}, below the national minimum of ${pct(band.min)} (LC 116/2003 art. 8-A, LC 157/2016) for list subitem ${item || "(not stated)"}; only 7.02, 7.05 and 16.01 may go lower.${yearNote}`, fix: "Check the rate and the service item. Where the buyer is in another municipality, a municipal rate under 2% is void (art. 8-A § 2) and the ISS is due where the buyer is (art. 3 § 4), so the buyer may withhold at its own city's rate. A Simples Nacional provider's rate follows its revenue band and is not judged here." };
}

/** The effective burden after a municipal benefit (a base reduction), against the minimum.
 *  issCents / grossBaseCents, both in cents. Returns null when fine, else {message, fix}. */
export function issBurdenProblem({ issCents, grossBaseCents, item = null, year = NaN, benefit = "" }) {
  const band = issBand(year);
  if (!band || !(grossBaseCents > 0) || !Number.isFinite(issCents) || issCents <= 0) return null;
  if (item && EXEMPT_ITEMS.has(item)) return null;
  const eff = (issCents / grossBaseCents) * 100;
  // Rounding: a cent of slack on the ISS.
  if (((issCents + 1) / grossBaseCents) * 100 >= band.min - 1e-9) return null;
  return { message: `With the municipal benefit${benefit ? ` (${benefit})` : ""}, the ISS is ${(issCents / 100).toFixed(2)} on a base of ${(grossBaseCents / 100).toFixed(2)} before the benefit: an effective ${eff.toFixed(2)}%, below the national minimum of ${pct(band.min)}. LC 116/2003 art. 8-A § 1 bars a benefit or base reduction that brings the burden under the minimum, except for subitems 7.02, 7.05 and 16.01 (this file's: ${item || "not stated"}).`, fix: "Check the benefit against the municipality's law and the service item; where the buyer is in another municipality the benefit is void (art. 8-A § 2) and the ISS is due where the buyer is." };
}
