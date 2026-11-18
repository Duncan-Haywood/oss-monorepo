// An NF-e item's presumed credit (IBSCBS/gCredPresOper) against Brazil's cCredPres table
// (ccredpres-data.mjs, built by build-ccredpres-data.mjs) and NT 2025.002-RTC's validation
// rules UB120 to UB130, read from a transcription of the NT's section 7 (version 1.51,
// higajooj/dfe_law_reference@7871ab40116f, src/nfe/nt2025-002/07-regras-de-validacao):
//   UB120-10 (cStat 1049): no gCredPresOper on an NFC-e (model 65);
//   UB122-10 (1055): cCredPres is not in the table;
//   UB123-10/20 (1053/1054): gIBSCredPres present when the code's IBS flag is off, or
//     missing when it is on; UB127-10/20 (1050/1058): the same for gCBSCredPres;
//   UB125-10/UB129-10 (1107/1124): for code 04 (used goods bought from a non-taxpayer
//     for resale), vCredPres may not exceed the item's vProd;
//   UB126-10 (1056): IBS vCredPresCondSus only from 2033 and only with code 04;
//   UB130-10 (1060): CBS vCredPresCondSus only from 2027 and only with code 04.
// What the table says and no UB rule enforces (the code's documents, the date each tax's
// credit starts, appropriation by event rather than in the document) is returned as a
// warning. An offline observation, not SEFAZ's authorisation, and not tax advice.
import { CODES, TABLE } from "./ccredpres-data.mjs";

export { TABLE };

// Codes whose "appropriated in the document" flag was switched off, and in which version of
// IT 2025.002 (biuspoly/RNFe mudancas_ibs_cbs.csv at the pinned commit).
const SWITCHED_OFF = { "01": "1.70", "02": "1.21", "03": "1.70" };

const short = (s) => (s.length > 80 ? s.slice(0, 77).replace(/[\s,;]+\S*$/, "") + "..." : s);
const money = (s) => {
  const n = Number(String(s ?? "").trim());
  return String(s ?? "").trim() !== "" && Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/** The table's entry for a code, or null. */
export function lookupCredPres(code) {
  const k = String(code ?? "").trim();
  return Object.hasOwn(CODES, k) ? { code: k, ...CODES[k] } : null;
}

/**
 * Check one item's gCredPresOper. `item` = { model: "55"|"65", date: "YYYY-MM-DD"?,
 * code, vProd, ibs: { pCredPres, vCredPres, vCredPresCondSus } | null, cbs: same | null }.
 * Returns [{ kind, message, fix, part?, severity? }], kind one of
 * code | group | value | table (table findings are warnings).
 */
export function checkCredPres(item) {
  const out = [];
  if (item.model === "65") {
    out.push({ kind: "code", message: "An NFC-e (model 65) may not carry a presumed credit (gCredPresOper) (SEFAZ cStat 1049, NT 2025.002 UB120-10).", fix: "Remove gCredPresOper; a presumed credit goes on a model 55 NF-e." });
    return out;
  }
  const code = String(item.code ?? "").trim();
  if (!/^\d{2}$/.test(code)) return out; // shape is the schema's (TcCredPres)
  const e = lookupCredPres(code);
  if (!e) {
    out.push({ kind: "code", message: `cCredPres ${code} is not in the presumed-credit table (codes ${Object.keys(CODES).sort().join(", ")}; IT 2025.002 ${TABLE.version}) (SEFAZ cStat 1055, UB122-10).`, fix: "Use the code of the presumed credit the operation takes (two digits, 01 to 13)." });
    return out;
  }
  const label = `cCredPres ${code} ("${short(e.name)}")`;
  for (const [part, on, have, codeIn, codeOut, rIn, rOut] of [["IBS", e.ibs, item.ibs, "1053", "1054", "UB123-10", "UB123-20"], ["CBS", e.cbs, item.cbs, "1050", "1058", "UB127-10", "UB127-20"]]) {
    if (have && !on) out.push({ kind: "group", part, message: `${label} takes no ${part} presumed credit, but the item has g${part}CredPres (SEFAZ cStat ${codeIn}, ${rIn}).`, fix: `Remove g${part}CredPres, or check cCredPres.` });
    if (!have && on) out.push({ kind: "group", part, message: `${label} requires the ${part} presumed credit, but the item has no g${part}CredPres (SEFAZ cStat ${codeOut}, ${rOut}).`, fix: `Add g${part}CredPres with pCredPres and vCredPres, or check cCredPres.` });
  }
  const year = /^\d{4}/.test(item.date || "") ? Number(item.date.slice(0, 4)) : null;
  for (const [part, g, condFrom, cCap, cCond, rCap, rCond] of [["IBS", item.ibs, 2033, "1107", "1056", "UB125-10", "UB126-10"], ["CBS", item.cbs, 2027, "1124", "1060", "UB129-10", "UB130-10"]]) {
    if (!g) continue;
    const v = money(g.vCredPres), prod = money(item.vProd);
    if (code === "04" && !Number.isNaN(v) && !Number.isNaN(prod) && v > prod) {
      out.push({ kind: "value", part, message: `The ${part} vCredPres ${g.vCredPres.trim()} is more than the item's vProd ${String(item.vProd).trim()}; for code 04 the credit may not exceed the product value (SEFAZ cStat ${cCap}, ${rCap}).`, fix: "Recompute vCredPres from vBCCredPres and pCredPres; it cannot be more than vProd." });
    }
    if (g.vCredPresCondSus !== undefined && g.vCredPresCondSus !== null) {
      const why = code !== "04" ? `only code 04 may use it, and this is ${code}` : year !== null && year < condFrom ? `it may be used only from ${condFrom}, and the NF-e is dated ${item.date}` : "";
      if (why) out.push({ kind: "value", part, message: `The item gives the ${part} presumed credit as vCredPresCondSus (under a suspensive condition), but ${why} (SEFAZ cStat ${cCond}, ${rCond}).`, fix: "Write the credit as vCredPres." });
    }
  }
  // What the table states but no NT 2025.002 UB rule rejects: warnings.
  if (!e.nfe) {
    const docs = [["nfce", "NFC-e"], ["cte", "CT-e"], ["nfse", "NFS-e"]].filter(([k]) => e[k]).map(([, n]) => n);
    out.push({ kind: "table", severity: "warning", message: `The table does not mark ${label} for the NF-e${docs.length ? `; it is marked for ${docs.join(" and ")}` : ""}. No NT 2025.002 rejection for this was found, but check the code.`, fix: "Check cCredPres against the operation." });
  }
  if (!e.inDoc && e.byEvent) {
    out.push({ kind: "table", severity: "warning", message: `The table marks ${label} as appropriated by event, not in the document ("Apropria DFe" off${SWITCHED_OFF[code] ? ` since IT 2025.002 ${SWITCHED_OFF[code]}` : ""}). No NT 2025.002 rejection for this was found, but the credit may belong in the appropriation event.`, fix: "Check whether this credit is claimed through the presumed-credit event instead of the NF-e." });
  }
  if (item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
    for (const [part, from, g] of [["IBS", e.fromIBS, item.ibs], ["CBS", e.fromCBS, item.cbs]]) {
      if (g && from && item.date < from) out.push({ kind: "table", severity: "warning", part, message: `The table starts the ${part} presumed credit of cCredPres ${code} on ${from}, but the NF-e is dated ${item.date}.`, fix: "Check the date, or leave the credit off until the table's start." });
    }
  }
  return out;
}
