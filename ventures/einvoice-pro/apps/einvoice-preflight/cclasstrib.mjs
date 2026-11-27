// An item's IBS/CBS classification (CST and cClassTrib) against Brazil's published table
// (cclasstrib-data.mjs, built by build-cclasstrib-data.mjs from the Conformidade Fácil
// classTrib answer). Used by nfe.mjs (NF-e and NFC-e, BR-053..BR-057) and nfse.mjs
// (national NFS-e, NFSE-034..NFSE-036). What the table states and this reads:
//   - each cClassTrib belongs to one CST (its first three digits);
//   - which documents may carry it (IndNFe, IndNFCe, IndNFSE);
//   - when it is valid (InicioVigencia, FimVigencia);
//   - which item groups its CST takes (IndIBSCBS, IndIBSCBSMono, IndTransfCred,
//     IndAjusteCompet, IndCredPresIBSZFM) and whether the code takes a presumed credit
//     (IndCredPresOper) or a credit reversal (IndEstornoCred);
//   - its rate reductions pRedIBS and pRedCBS, which the NF-e schema's pRedAliq carries
//     ("Percentual de redução de aliquota do cClassTrib", DFeTiposBasicos_v1.00.xsd, TRed).
// The rejection codes SEFAZ or the national system return for these were not read (their
// hosts refused the build host), so none is named. An offline observation, not tax advice.
import { CST, CODES, TABLE } from "./cclasstrib-data.mjs";

export { TABLE };

const DOC = { nfe: ["nfe", "NF-e (model 55)"], nfce: ["nfce", "NFC-e (model 65)"], nfse: ["nfse", "NFS-e"] };
const GROUP_FLAG = { gIBSCBS: "ibscbs", gIBSCBSMono: "mono", gTransfCred: "transf", gAjusteCompet: "ajuste", gCredPresIBSZFM: "zfm" };
const short = (s) => (s.length > 90 ? s.slice(0, 87).replace(/[\s,;]+\S*$/, "") + "..." : s);
const pct = (n) => `${Number(n.toFixed(4))}%`;

/** The table's entry for a code, or null. */
export function lookupClassTrib(code) {
  const k = String(code).trim();
  const c = Object.hasOwn(CODES, k) ? CODES[k] : null;
  return c ? { code: String(code).trim(), ...c, cstName: CST[c.cst]?.name || "" } : null;
}

/** Codes a CST may carry on a document, for a fix line. */
export function codesFor(cst, doc) {
  return Object.entries(CODES).filter(([, c]) => c.cst === cst && (!doc || !Object.hasOwn(DOC, doc) || c[DOC[doc][0]])).map(([k]) => k);
}

/**
 * Check one item. `item` = { cst, code, doc: "nfe"|"nfce"|"nfse", date: "YYYY-MM-DD"?,
 * groups: [names of the item groups present]?, red: { IBSUF?, IBSMun?, CBS? } (pRedAliq
 * as written, absent when the group has no gRed) and `taxed` (which of those tax groups
 * are present) }. Returns [{ kind, message, fix }], kind one of
 * unknown | cst | doc | date | group | red.
 */
export function checkClassTrib(item) {
  const out = [];
  const cst = String(item.cst || "").trim(), code = String(item.code || "").trim();
  if (!/^\d{3}$/.test(cst) || !/^\d{6}$/.test(code)) return out; // shape is the schema's
  const e = Object.hasOwn(CODES, code) ? CODES[code] : null;
  const [flag, docName] = Object.hasOwn(DOC, item.doc) ? DOC[item.doc] : DOC.nfe;
  if (!e) {
    const same = codesFor(cst, item.doc);
    out.push({ kind: "unknown", message: `cClassTrib ${code} is not in the IBS/CBS classification table (${TABLE.codes} codes, published ${TABLE.published}).`,
      fix: same.length ? `Use a code the table lists for CST ${cst} on an ${docName}: ${same.slice(0, 8).join(", ")}${same.length > 8 ? ", ..." : ""}.` : `CST ${cst} has no code for an ${docName} in the table; check the CST.` });
    return out;
  }
  if (e.cst !== cst) {
    out.push({ kind: "cst", message: `cClassTrib ${code} ("${short(e.name)}") belongs to CST ${e.cst} (${CST[e.cst]?.name || "?"}), not CST ${cst}${CST[cst] ? ` (${CST[cst].name})` : ""}.`,
      fix: `Set CST to ${e.cst}, or pick a cClassTrib of CST ${cst}${codesFor(cst, item.doc).length ? ` (${codesFor(cst, item.doc).slice(0, 6).join(", ")})` : ""}.` });
  }
  if (!e[flag]) {
    const docs = Object.values(DOC).filter(([k]) => e[k]).map(([, n]) => n);
    out.push({ kind: "doc", message: `The table does not allow cClassTrib ${code} ("${short(e.name)}") on an ${docName}${docs.length ? `; it is marked for ${docs.join(" and ")}` : "; it is marked for other documents (CT-e, BP-e, NF3e and so on)"}.`,
      fix: `Pick a code of CST ${e.cst} marked for ${docName}${codesFor(e.cst, item.doc).length ? ` (${codesFor(e.cst, item.doc).slice(0, 6).join(", ")})` : ": the table has none, so check the CST"}.` });
  }
  if (item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
    if (e.to && item.date > e.to) out.push({ kind: "date", message: `cClassTrib ${code} stopped being valid on ${e.to} (FimVigencia) but the document is dated ${item.date}.`, fix: `Use the code that replaced it for CST ${e.cst}.` });
    else if (e.from && item.date < e.from) out.push({ kind: "date", message: `cClassTrib ${code} is valid from ${e.from} (InicioVigencia) but the document is dated ${item.date}.`, fix: "Check the date, or use a code valid on that date." });
  }
  const c = Object.hasOwn(CST, cst) ? CST[cst] : null;
  for (const g of item.groups || []) {
    if (c && Object.hasOwn(GROUP_FLAG, g) && !c[GROUP_FLAG[g]]) {
      const takes = Object.entries(GROUP_FLAG).filter(([, f]) => c[f]).map(([n]) => n);
      out.push({ kind: "group", message: `CST ${cst} (${c.name}) does not take the ${g} group (the table's indicator is off)${takes.length ? `; it takes ${takes.join(" or ")}` : "; it takes no IBS/CBS value group"}.`, fix: takes.length ? `Move the values into ${takes.join(" or ")}, or correct the CST.` : `Remove ${g}, or correct the CST.`, group: g });
    }
    if (g === "gCredPresOper" && !e.credPres) out.push({ kind: "group", message: `cClassTrib ${code} does not take a presumed credit (IndCredPresOper is off), but the item has gCredPresOper.`, fix: "Remove gCredPresOper, or use the cClassTrib the presumed credit belongs to.", group: g });
    if (g === "gEstornoCred" && !e.estorno) out.push({ kind: "group", message: `cClassTrib ${code} does not take a credit reversal (IndEstornoCred is off), but the item has gEstornoCred.`, fix: "Remove gEstornoCred, or use the cClassTrib the reversal belongs to.", group: g });
  }
  if (item.red && e.cst === cst) {
    for (const [part, want] of [["IBSUF", e.pRedIBS], ["IBSMun", e.pRedIBS], ["CBS", e.pRedCBS]]) {
      if (!item.taxed?.includes(part)) continue;
      const have = item.red[part];
      const tax = part === "CBS" ? "CBS" : "IBS";
      if (have === undefined || have === "") {
        if (want > 0) out.push({ kind: "red", part, message: `cClassTrib ${code} reduces the ${tax} rate by ${pct(want)}, but the item's ${part} group has no reduction (gRed).`, fix: `Add gRed with pRedAliq ${want.toFixed(4)} and the effective rate it gives, or check the cClassTrib.` });
        continue;
      }
      const n = Number(have);
      if (Number.isFinite(n) && Math.abs(n - want) > 0.00005) out.push({ kind: "red", part, message: `The ${part} pRedAliq is ${have}, but cClassTrib ${code} reduces the ${tax} rate by ${pct(want)}.`, fix: `Set pRedAliq to ${want.toFixed(4)} (and recompute the effective rate and the tax), or check the cClassTrib.` });
    }
  }
  return out;
}
