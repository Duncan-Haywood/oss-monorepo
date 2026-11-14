// Offline checks for Brazil's presumed-credit appropriation event, tpEvento 211110
// ("Solicitação de Apropriação de crédito presumido", NT 2025.002-RTC section 8.4): the
// event a buyer (or the issuer, when the NF-e left it out or got it wrong) sends to claim a
// presumed IBS/CBS credit on an NF-e item. Reads <envEvento>, <evento> or <procEventoNFe>
// in http://www.portalfiscal.inf.br/nfe. Rule ids BRE-nnn are this tool's own; each names
// the SEFAZ rejection it matches (cStat texts from nfephp-org/sped-nfe docs/cStat.md, MIT).
//
// Sources, read 2026-11-14 (the Portal da NF-e and SVRS refused the build host):
//   * the event-specific schema e211110_v1.00.xsd of each RTC event package, from the
//     official ZIPs mirrored with their portal URLs in stackin-io/data-source
//     (data/nfe/esquemas-xml/): NT 2025.002 v1.20 (2025-08-18), v1.30 (2025-10-07) and
//     v1.40 (2026-07-27, the latest events package listed on 2026-11-13). Only the facts of
//     the layout are restated here (element names, order, counts and patterns; schemas
//     are official acts, Lei 9.610/1998 art. 8, IV); tiposBasico_v1.03.xsd for the types;
//   * the rules 2P12-10 .. 2P30-20 of section 8.4.3, NT 2025.002 v1.51 as transcribed at
//     higajooj/dfe_law_reference@7871ab40116f src/nfe/nt2025-002/08-eventos/08-04-*.md;
//   * the event Id "ID" + tpEvento + chNFe + nSeqEvento (two digits), as cStat 572 states
//     it and sped-nfe's Tools.php builds it.
//
// The layout changed between packages: v1.20 allowed only tpAutor 1 (issuer), v1.30 only 2
// (buyer), and v1.40 allows both and moved to gCredPresOper with one cCredPres per item and
// groups gIBSCredPres/gCBSCredPres (the NF-e item's own names), where v1.20/v1.30 had
// gCredPres with vBC and a cCredPres inside each of gIBS and gCBS. A file in the old layout
// is named as such, and convertCredPresEvent() rewrites it when both groups use one code.
//
// With the NF-e the event refers to (optional), also: the item exists (1096), the buyer or
// issuer is the author (575/574), the NF-e is not an NFC-e (1049) and the event is not dated
// before it (577). An offline observation, not SEFAZ's answer, and not tax advice.

import { parseCfdiXml } from "./cfdi-xml.mjs";
import { checkBrazilId } from "./brazil.mjs";
import { lookupCredPres, TABLE } from "./ccredpres.mjs";
import { keyCheckDigit, NFE_NS, UF_CODE } from "./nfe.mjs";
import { checkCancelAgainst, checkRtcDetEvento, RTC_EVENTS, RTC_NO_SCHEMA, sequence } from "./nfe-rtc-events.mjs";

export const EVENT_TYPE = "211110";
export const DESC = "Solicitação de Apropriação de crédito presumido";
// The packages whose e211110_v1.00.xsd was read (SHA-256 of each file as mirrored).
export const LAYOUTS = {
  "1.20": { published: "2025-08-18", tpAutor: ["1"], sha256: "6a547790c59890981a15dfb78c0c50fbaf064aa7ebbd756f26b2238811b41892" },
  "1.30": { published: "2025-10-07", tpAutor: ["2"], sha256: "7dd43dc4fdfeff35f2da61e1ba683a93119b07481ada214caacf659a08069282" },
  "1.40": { published: "2026-07-27", tpAutor: ["1", "2"], sha256: "610452ad57365ee84667ebf2a38940422213aedf8f1419374e51ce13cc784d16" },
};

// tiposBasico_v1.03.xsd patterns.
const T = {
  TDec_1302: /^(?:0|0\.[0-9]{2}|[1-9][0-9]{0,12}(?:\.[0-9]{2})?)$/,
  TDec_0302_04: /^(?:0|0\.[0-9]{2,4}|[1-9][0-9]{0,2}(?:\.[0-9]{2,4})?)$/,
  TnItem: /^(?:[1-9][0-9]?|[1-8][0-9]{2}|9[0-8][0-9]|990)$/,
};
const UF = new Set(Object.values(UF_CODE));
const KEY = /^\d{6}[0-9A-Z]{12}\d{26}$/;

function finding(rule, message, fix, path, severity) {
  const f = { rule, message, fix, path };
  if (severity) f.severity = severity;
  return f;
}
const kid = (n, name) => n?.children.find((c) => c.name === name);
const kidsOf = (n, name) => (n?.children || []).filter((c) => c.name === name);
const txt = (n, name) => (kid(n, name)?.text ?? "").trim();
// The schema's types are xs:string with whiteSpace preserve: patterns see the raw text.
const raw = (n, name) => kid(n, name)?.text ?? "";
// TString (tiposBasico_v1.03.xsd): no leading or trailing space, characters U+0020 to U+00FF.
const TSTRING = /^[!-\u00ff](?:[ -\u00ff]*[!-\u00ff])?$/u;
const named = (n) => (n?.children || []).filter((c) => c.name);

export function looksLikeNfeEvent(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?(?:envEvento|evento|procEventoNFe)[\s>]/.test(head) && head.includes(NFE_NS);
}

const OLD = new Set(["gCredPres", "vBC", "gIBS", "gCBS"]);
function oldLayout(det) {
  return named(det).some((c) => c.name === "gCredPres") && !named(det).some((c) => c.name === "gCredPresOper");
}

/**
 * The events in a file: [{ evento, inf, det, path }]; or { error } when the root is not
 * an event in the NF-e namespace.
 */
function events(root) {
  if (!root || root.ns !== NFE_NS) return { error: "The root element is not in the namespace http://www.portalfiscal.inf.br/nfe." };
  if (root.name === "envEvento") return { list: kidsOf(root, "evento").map((e, i) => ({ evento: e, path: `/envEvento/evento[${i + 1}]` })) };
  if (root.name === "procEventoNFe") return { list: [{ evento: kid(root, "evento"), path: "/procEventoNFe/evento" }], ret: kid(kid(root, "retEvento"), "infEvento") };
  if (root.name === "evento") return { list: [{ evento: root, path: "/evento" }] };
  return { error: `The root element is ${root.name}, not envEvento, evento or procEventoNFe.` };
}

function readNfe(text) {
  if (!text) return null;
  try {
    const r = parseCfdiXml(text).root;
    const nfe = r?.name === "nfeProc" ? kid(r, "NFe") : r?.name === "NFe" ? r : null;
    const inf = kid(nfe, "infNFe");
    if (!inf) return null;
    const ide = kid(inf, "ide"), emit = kid(inf, "emit"), dest = kid(inf, "dest");
    return {
      key: (inf.attrs.Id || "").replace(/^NFe/, ""), mod: txt(ide, "mod"), dhEmi: txt(ide, "dhEmi"),
      emit: txt(emit, "CNPJ") || txt(emit, "CPF"), dest: txt(dest, "CNPJ") || txt(dest, "CPF"),
      items: new Set(kidsOf(inf, "det").map((d) => d.attrs.nItem)),
      itemNodes: new Map(kidsOf(inf, "det").map((d) => [d.attrs.nItem, d])),
    };
  } catch { return null; }
}

// The rest of an RTC event other than 211110: its detEvento (nfe-rtc-events.mjs), the author
// against the key or the NF-e, and the date against the NF-e.
function checkRtcEnvelopeTail({ inf, det, base, dpath, tpEvento, chNFe, dh, author, authorCnpj, authorCpf, nfe, meta }, out, skipped) {
  const withNfe = nfe && nfe.key === chNFe;
  const m = checkRtcDetEvento({ code: tpEvento, det, dpath, nfe: withNfe ? { key: nfe.key, items: nfe.itemNodes } : null }, out, skipped);
  Object.assign(meta, m, { layout: "1.40" });
  const tpAutor = m.tpAutor;
  const who = authorCnpj ? "CNPJ" : "CPF";
  if (tpAutor === "1" && author && KEY.test(chNFe)) {
    const mine = authorCnpj || (authorCpf ? "000" + authorCpf : "");
    if (mine && mine !== chNFe.slice(6, 20)) out.push(finding("BRE-012", `tpAutor is 1 (issuer), but the author ${who} ${author} is not the issuer in chNFe (${chNFe.slice(6, 20)}) (SEFAZ cStat 574, MOC rule P12-44).`, "Send from the issuer's CNPJ.", `${base}/${who}`));
  }
  if (withNfe) {
    if (tpAutor === "2" && author && nfe.dest && author !== nfe.dest) out.push(finding("BRE-012", `tpAutor is 2 (buyer), but the author ${author} is not the NF-e's dest ${nfe.dest} (SEFAZ cStat 575, rule 2P21-10).`, "Send from the buyer's CNPJ or CPF on the NF-e.", `${base}/${who}`));
    if (/^\d{4}-\d{2}-\d{2}T/.test(dh) && /^\d{4}-\d{2}-\d{2}T/.test(nfe.dhEmi) && Date.parse(dh) < Date.parse(nfe.dhEmi)) out.push(finding("BRE-013", `dhEvento ${dh} is before the NF-e's dhEmi ${nfe.dhEmi} (SEFAZ cStat 577).`, "Date the event at or after the NF-e's issue.", `${base}/dhEvento`));
    if (tpEvento === "112150") {
      const d = raw(det, "dPrevEntrega");
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{4}-\d{2}-\d{2}/.test(nfe.dhEmi) && d < nfe.dhEmi.slice(0, 10)) out.push(finding("BRE-034", `dPrevEntrega ${d} is before the NF-e was issued (${nfe.dhEmi.slice(0, 10)}). Section 8.18 states no rule for this, so it is a warning.`, "Check the new delivery date.", `${dpath}/dPrevEntrega`, "warning"));
    }
  } else if (RTC_EVENTS[tpEvento].tpAutor !== "8" && tpEvento !== "110001") {
    skipped.push(`${base}: the NF-e for chNFe was not given, so ${tpAutor === "2" ? "the buyer as author (575), " : ""}the event date (577)${RTC_EVENTS[tpEvento].item ? " and each item against the NF-e" : ""} were not checked; add the NF-e to the same check`);
  }
  if (tpEvento === "110001") meta.cancel = { chNFe, seq: txt(inf, "nSeqEvento"), author, orgao: raw(det, "cOrgaoAutor"), tpEventoAut: m.tpEventoAut, nProt: m.nProtEvento, path: base };
  return meta;
}

function checkOne(ev, nfe, out, skipped) {
  const { evento, path } = ev;
  const inf = kid(evento, "infEvento");
  const base = `${path}/infEvento`;
  if (!inf) { out.push(finding("BRE-002", "The event has no infEvento.", "Build the event with infEvento holding cOrgao, tpAmb, the author's CNPJ or CPF, chNFe, dhEvento, tpEvento, nSeqEvento, verEvento and detEvento.", path)); return {}; }
  const tpEvento = txt(inf, "tpEvento");
  const rtc = tpEvento !== EVENT_TYPE && Object.hasOwn(RTC_EVENTS, tpEvento) ? RTC_EVENTS[tpEvento] : null;
  if (tpEvento !== EVENT_TYPE && !rtc) {
    skipped.push(`${base}: tpEvento ${tpEvento || "(none)"}${Object.hasOwn(RTC_NO_SCHEMA, tpEvento) ? ` (${RTC_NO_SCHEMA[tpEvento]}) has no schema in the NT 2025.002 v1.40 events package, so it is not read` : " is not one of the NT 2025.002 reform events this check reads (211110, 112110, 112130, 112140, 112150, 211124, 211128, 211130, 211140, 211150, 212110, 212120, and the cancellation 110001)"}`);
    return { tpEvento };
  }
  const name = rtc ? rtc.desc : DESC;
  const what = rtc ? `the event ${tpEvento} ("${rtc.desc}", NT 2025.002 ${rtc.section})` : "the presumed-credit event";
  const chNFe = txt(inf, "chNFe"), seq = txt(inf, "nSeqEvento"), dh = txt(inf, "dhEvento");
  const meta = { tpEvento, chNFe, tpAmb: txt(inf, "tpAmb"), nSeqEvento: seq };

  // ---- the envelope (MOC 5.8, general part) ----
  const want = `ID${tpEvento}${chNFe}${/^\d{1,2}$/.test(seq) ? seq.padStart(2, "0") : seq}`;
  if ((inf.attrs.Id || "") !== want) out.push(finding("BRE-010", `The event Id "${inf.attrs.Id || ""}" is not "ID" + tpEvento + chNFe + nSeqEvento in two digits, ${want} (SEFAZ cStat 572).`, `Set Id to ${want}.`, `${base}/@Id`));
  if (txt(inf, "verEvento") !== "1.00") out.push(finding("BRE-010", `verEvento is "${txt(inf, "verEvento")}"; the layout of ${what} is 1.00 (SEFAZ cStat 492).`, "Set verEvento to 1.00.", `${base}/verEvento`));
  if (!KEY.test(chNFe)) {
    out.push(finding("BRE-011", `chNFe "${chNFe}" is not a 44-character NF-e access key.`, "Copy the key of the NF-e the event is about.", `${base}/chNFe`));
  } else {
    if (/^\d{44}$/.test(chNFe)) {
      const dv = keyCheckDigit(chNFe.slice(0, 43));
      if (String(dv) !== chNFe[43]) out.push(finding("BRE-011", `chNFe's check digit is ${chNFe[43]}; the other 43 digits give ${dv} (SEFAZ cStat 236).`, "Copy the key from the NF-e again: a digit is mistyped.", `${base}/chNFe`));
    } else skipped.push(`${base}/chNFe: the key carries an alphanumeric CNPJ; its check-digit rule was not read`);
    const mod = chNFe.slice(20, 22);
    if (mod === "65" && !rtc) out.push(finding("BRE-011", "chNFe is an NFC-e key (model 65); a presumed credit may not be claimed on an NFC-e (SEFAZ cStat 1049, rule 2P12-10).", "Claim presumed credit only on a model 55 NF-e.", `${base}/chNFe`));
    else if (mod === "65") out.push(finding("BRE-011", `chNFe is an NFC-e key (model 65); ${what} is for a model 55 NF-e only.`, "Send this event only on a model 55 NF-e.", `${base}/chNFe`));
    else if (mod !== "55") out.push(finding("BRE-011", `chNFe's model digits are ${mod}; ${what} is for a model 55 NF-e only (a key's model is 55 or 65: SEFAZ cStat 618, MOC rule P12-30).`, "Copy the key of the NF-e the event is about.", `${base}/chNFe`));
    if (!UF.has(chNFe.slice(0, 2))) out.push(finding("BRE-011", `chNFe starts with ${chNFe.slice(0, 2)}, which is not a state's IBGE code (SEFAZ cStat 614, MOC rule P12-14).`, "Copy the key of the NF-e the event is about.", `${base}/chNFe`));
    const yy = Number(chNFe.slice(2, 4)), mm = Number(chNFe.slice(4, 6));
    if (/^\d{4}$/.test(chNFe.slice(2, 6)) && yy < 6) out.push(finding("BRE-011", `chNFe's year digits are ${chNFe.slice(2, 4)}; a key's year is 06 or later (SEFAZ cStat 615, MOC rule P12-18).`, "Copy the key of the NF-e the event is about.", `${base}/chNFe`));
    if (/^\d{4}$/.test(chNFe.slice(2, 6)) && (mm < 1 || mm > 12)) out.push(finding("BRE-011", `chNFe's month digits are ${chNFe.slice(4, 6)}, not 01 to 12 (SEFAZ cStat 616, MOC rule P12-22).`, "Copy the key of the NF-e the event is about.", `${base}/chNFe`));
    if (/^0{9}$/.test(chNFe.slice(25, 34))) out.push(finding("BRE-011", "chNFe's NF-e number (digits 26 to 34) is zero (SEFAZ cStat 619, MOC rule P12-34).", "Copy the key of the NF-e the event is about.", `${base}/chNFe`));
  }
  const authorCnpj = txt(inf, "CNPJ"), authorCpf = txt(inf, "CPF");
  const author = authorCnpj || authorCpf;
  for (const [k, v, code] of [["CNPJ", authorCnpj, "489"], ["CPF", authorCpf, "490"]]) {
    if (!v) continue;
    const r = checkBrazilId(v);
    if (!r.ok) out.push(finding("BRE-012", `The author's ${k} ${v}: ${r.problems[0]} (SEFAZ cStat ${code}).`, `Copy the ${k} of the company sending the event.`, `${base}/${k}`));
  }

  // ---- detEvento (e211110_v1.00.xsd) ----
  const det = kid(inf, "detEvento");
  const dpath = `${base}/detEvento`;
  if (!det) { out.push(finding(rtc ? "BRE-030" : "BRE-002", "infEvento has no detEvento (SEFAZ cStat 493).", rtc ? `Add detEvento as the ${tpEvento} schema lays it out.` : "Add detEvento with descEvento, cOrgaoAutor, tpAutor, verAplic and one gCredPresOper per item.", dpath)); return meta; }
  meta.name = name;
  if (rtc) return checkRtcEnvelopeTail({ inf, det, base, dpath, tpEvento, chNFe, dh, author, authorCnpj, authorCpf, nfe, meta }, out, skipped);
  if (oldLayout(det)) {
    const mixedCodes = kidsOf(det, "gCredPres").some((g) => kid(g, "gIBS") && kid(g, "gCBS") && txt(kid(g, "gIBS"), "cCredPres") !== txt(kid(g, "gCBS"), "cCredPres"));
    out.push(finding("BRE-003", `This event is in the layout of NT 2025.002 v1.20/v1.30 (gCredPres with vBC, and a cCredPres inside gIBS and gCBS). The v1.40 schema (events package of 2026-07-27) replaced it with gCredPresOper: vBCCredPres, one cCredPres for the item, then gIBSCredPres and gCBSCredPres with pCredPres and vCredPres (SEFAZ cStat 493 under v1.40).`, mixedCodes ? "Rewrite each item as gCredPresOper. Some items give a different cCredPres for IBS and CBS, which v1.40 cannot hold: one code per item, so check which presumed credit the item takes." : "Rewrite each item as gCredPresOper (the converter on this page does it when both groups share one code).", `${dpath}/gCredPres`));
    meta.layout = "1.20/1.30";
    const tpA = txt(det, "tpAutor");
    if (tpA) meta.tpAutor = tpA;
    return meta;
  }
  meta.layout = "1.40";
  if (det.attrs.versao !== "1.00") out.push(finding("BRE-002", `detEvento/@versao is "${det.attrs.versao ?? ""}"; the schema allows 1.00 (SEFAZ cStat 493).`, "Set detEvento versao=\"1.00\".", `${dpath}/@versao`));
  for (const p of sequence(det, [["descEvento", 1, 1], ["cOrgaoAutor", 1, 1], ["tpAutor", 1, 1], ["verAplic", 1, 1], ["gCredPresOper", 1, 990]])) {
    out.push(finding("BRE-002", `detEvento: ${p} (SEFAZ cStat 493).`, "Order detEvento as descEvento, cOrgaoAutor, tpAutor, verAplic, then 1 to 990 gCredPresOper.", dpath));
  }
  if (kid(det, "descEvento") && raw(det, "descEvento") !== DESC) out.push(finding("BRE-002", `descEvento is "${raw(det, "descEvento")}"; the schema allows only "${DESC}" (SEFAZ cStat 493).`, `Set descEvento to "${DESC}", accents included.`, `${dpath}/descEvento`));
  const orgao = raw(det, "cOrgaoAutor");
  if (kid(det, "cOrgaoAutor") && !UF.has(orgao)) out.push(finding("BRE-002", `cOrgaoAutor ${orgao} is not a state's IBGE code (TCodUfIBGE) (SEFAZ cStat 493).`, "Give the author's state code (two digits, e.g. 35 for SP).", `${dpath}/cOrgaoAutor`));
  const tpAutor = raw(det, "tpAutor");
  meta.tpAutor = tpAutor;
  if (kid(det, "tpAutor") && !["1", "2"].includes(tpAutor)) out.push(finding("BRE-002", `tpAutor ${tpAutor} is not 1 (issuer) or 2 (buyer), the two the v1.40 schema allows (SEFAZ cStat 493).`, "Use 2 when the buyer claims the credit, 1 when the issuer adds or corrects it.", `${dpath}/tpAutor`));
  const ver = raw(det, "verAplic");
  if (kid(det, "verAplic") && ([...ver].length < 1 || [...ver].length > 20 || !TSTRING.test(ver))) out.push(finding("BRE-002", `verAplic "${ver}" ${TSTRING.test(ver) || !ver ? `has ${[...ver].length} characters` : "has a leading or trailing space or a character outside Latin-1"}; the schema takes 1 to 20 characters with no space at either end (TVerAplic) (SEFAZ cStat 493).`, "Give your application's version, 1 to 20 characters.", `${dpath}/verAplic`));

  // ---- author against the key (2P21-05) ----
  if (tpAutor === "1" && author && KEY.test(chNFe)) {
    const inKey = chNFe.slice(6, 20);
    const mine = authorCnpj || (authorCpf ? "000" + authorCpf : "");
    if (mine && mine !== inKey) out.push(finding("BRE-012", `tpAutor is 1 (issuer), but the author ${authorCnpj ? "CNPJ" : "CPF"} ${author} is not the issuer in chNFe (${inKey}) (SEFAZ cStat 574, rule 2P21-05).`, "Send as tpAutor 2 if the buyer claims the credit, or send from the issuer's CNPJ.", `${base}/${authorCnpj ? "CNPJ" : "CPF"}`));
  }
  if (nfe && nfe.key === chNFe) {
    if (tpAutor === "2" && author && nfe.dest && author !== nfe.dest) out.push(finding("BRE-012", `tpAutor is 2 (buyer), but the author ${author} is not the NF-e's dest ${nfe.dest} (SEFAZ cStat 575, rule 2P21-10).`, "Send from the buyer's CNPJ or CPF on the NF-e.", `${base}/${authorCnpj ? "CNPJ" : "CPF"}`));
    if (nfe.mod === "65") out.push(finding("BRE-011", "The NF-e this event refers to is an NFC-e (model 65) (SEFAZ cStat 1049, rule 2P12-10).", "Claim presumed credit only on a model 55 NF-e.", `${base}/chNFe`));
    if (/^\d{4}-\d{2}-\d{2}T/.test(dh) && /^\d{4}-\d{2}-\d{2}T/.test(nfe.dhEmi) && Date.parse(dh) < Date.parse(nfe.dhEmi)) out.push(finding("BRE-013", `dhEvento ${dh} is before the NF-e's dhEmi ${nfe.dhEmi} (SEFAZ cStat 577).`, "Date the event at or after the NF-e's issue.", `${base}/dhEvento`));
  } else if (nfe === undefined || nfe === null) {
    skipped.push(`${base}: the NF-e for chNFe was not given, so the item numbers (1096), the buyer as author (575) and the event date against the NF-e (577) were not checked; add the NF-e to the same check`);
  }

  // ---- each item (gCredPresOper) ----
  const seen = new Set();
  kidsOf(det, "gCredPresOper").forEach((g, i) => {
    const gp = `${dpath}/gCredPresOper[${i + 1}]`;
    const n = g.attrs.nItem;
    const label = `Item ${n ?? i + 1}`;
    if (n === undefined) out.push(finding("BRE-002", `gCredPresOper ${i + 1} has no nItem attribute (SEFAZ cStat 493).`, "Give the det/@nItem of the NF-e item the credit is on.", gp));
    else if (!T.TnItem.test(n)) out.push(finding("BRE-002", `nItem "${n}" is not 1 to 990 (TnItem) (SEFAZ cStat 493).`, "Give the det/@nItem of the NF-e item the credit is on.", `${gp}/@nItem`));
    else if (seen.has(n)) out.push(finding("BRE-002", `nItem ${n} appears twice; the schema's pk_nItem keeps one gCredPresOper per item (rule 2P24-05, SEFAZ cStat 493).`, "Merge the two groups, or fix the item number.", `${gp}/@nItem`));
    else if (nfe && nfe.key === chNFe && !nfe.items.has(n)) out.push(finding("BRE-014", `${label}: the NF-e has no det with nItem ${n} (SEFAZ cStat 1096, rule 2P24-10).`, "Use the item numbers of the NF-e the key names.", `${gp}/@nItem`));
    if (n !== undefined) seen.add(n);
    for (const p of sequence(g, [["vBCCredPres", 1, 1], ["cCredPres", 1, 1], ["gIBSCredPres", 0, 1], ["gCBSCredPres", 0, 1]])) out.push(finding("BRE-002", `${label}: ${p} (SEFAZ cStat 493).`, "Order gCredPresOper as vBCCredPres, cCredPres, gIBSCredPres, gCBSCredPres.", gp));
    const vbc = raw(g, "vBCCredPres");
    if (kid(g, "vBCCredPres") && !T.TDec_1302.test(vbc)) out.push(finding("BRE-002", `${label}: vBCCredPres "${vbc}" is not a decimal with two places (TDec_1302) (SEFAZ cStat 493).`, "Write the base as digits with a point and two decimals, e.g. 1500.00.", `${gp}/vBCCredPres`));
    const groups = {};
    for (const part of ["IBS", "CBS"]) {
      const gg = kid(g, `g${part}CredPres`);
      if (!gg) continue;
      groups[part] = gg;
      for (const p of sequence(gg, [["pCredPres", 1, 1], ["vCredPres", 1, 1]])) out.push(finding("BRE-002", `${label}, g${part}CredPres: ${p} (SEFAZ cStat 493).`, "Give pCredPres then vCredPres.", `${gp}/g${part}CredPres`));
      const pc = raw(gg, "pCredPres"), vc = raw(gg, "vCredPres");
      if (kid(gg, "pCredPres") && !T.TDec_0302_04.test(pc)) out.push(finding("BRE-002", `${label}: g${part}CredPres/pCredPres "${pc}" is not a percentage with 2 to 4 decimals (TDec_0302_04) (SEFAZ cStat 493).`, "Write the rate as e.g. 2.5000.", `${gp}/g${part}CredPres/pCredPres`));
      if (kid(gg, "vCredPres") && !T.TDec_1302.test(vc)) out.push(finding("BRE-002", `${label}: g${part}CredPres/vCredPres "${vc}" is not a decimal with two places (TDec1302) (SEFAZ cStat 493).`, "Write the credit as e.g. 37.50.", `${gp}/g${part}CredPres/vCredPres`));
      // vCredPres = vBCCredPres x pCredPres / 100: the field notes do not state it, so warn only.
      if (T.TDec_1302.test(vbc) && T.TDec_0302_04.test(pc) && T.TDec_1302.test(vc)) {
        const want = Math.round((Math.round(Number(vbc) * 100) * Math.round(Number(pc) * 10000)) / 1e6);
        const have = Math.round(Number(vc) * 100);
        if (Math.abs(want - have) > 1) out.push(finding("BRE-021", `${label}: g${part}CredPres/vCredPres ${vc} is not vBCCredPres ${vbc} x pCredPres ${pc}% = ${(want / 100).toFixed(2)}. No SEFAZ rule for this was found in section 8.4, so this is a warning.`, "Recompute vCredPres from the base and the rate, or check the base.", `${gp}/g${part}CredPres/vCredPres`, "warning"));
      }
    }
    // ---- the cCredPres table (2P25a-10, 2P26-10/20, 2P30-10/20) ----
    const code = raw(g, "cCredPres");
    if (!kid(g, "cCredPres")) return;
    if (!/^\d{2}$/.test(code)) { out.push(finding("BRE-002", `${label}: cCredPres "${code}" is not two digits (SEFAZ cStat 493).`, "Give the two-digit code from the cCredPres table.", `${gp}/cCredPres`)); return; }
    const e = lookupCredPres(code);
    if (!e) { out.push(finding("BRE-020", `${label}: cCredPres ${code} is not in the presumed-credit table (IT 2025.002 ${TABLE.version}) (SEFAZ cStat 1055, rule 2P25a-10).`, "Use the code of the presumed credit the item takes (two digits, 01 to 13).", `${gp}/cCredPres`)); return; }
    for (const [part, on, cIn, cOut, rIn, rOut] of [["IBS", e.ibs, "1053", "1054", "2P26-10", "2P26-20"], ["CBS", e.cbs, "1050", "1058", "2P30-10", "2P30-20"]]) {
      if (groups[part] && !on) out.push(finding("BRE-020", `${label}: cCredPres ${code} takes no ${part} presumed credit, but the item has g${part}CredPres (SEFAZ cStat ${cIn}, rule ${rIn}).`, `Remove g${part}CredPres, or check cCredPres.`, `${gp}/g${part}CredPres`));
      if (!groups[part] && on) out.push(finding("BRE-020", `${label}: cCredPres ${code} requires the ${part} presumed credit, but the item has no g${part}CredPres (SEFAZ cStat ${cOut}, rule ${rOut}).`, `Add g${part}CredPres with pCredPres and vCredPres, or check cCredPres.`, `${gp}/cCredPres`));
    }
    // What the table says and no 8.4.3 rule rejects: warnings.
    if (!e.byEvent) out.push(finding("BRE-022", `${label}: the table does not mark cCredPres ${code} as appropriated by event ("Apropria via Evento" off${e.inDoc ? "; it is appropriated in the NF-e itself" : ""}). Section 8.4.3 has no rejection for this, but check the code.`, "Claim this credit in the NF-e's gCredPresOper if the table appropriates it there.", `${gp}/cCredPres`, "warning"));
    const day = /^\d{4}-\d{2}-\d{2}/.test(dh) ? dh.slice(0, 10) : "";
    for (const [part, from] of [["IBS", e.fromIBS], ["CBS", e.fromCBS]]) {
      if (groups[part] && from && day && day < from) out.push(finding("BRE-022", `${label}: the table starts the ${part} presumed credit of cCredPres ${code} on ${from}; the event is dated ${day}.`, "Check the date, or wait until the table's start.", `${gp}/g${part}CredPres`, "warning"));
    }
  });
  return meta;
}

/** The fields of a (registered) event a cancellation is compared with; null if unreadable. */
export function readEventSummary(text) {
  let root;
  try { root = parseCfdiXml(text).root; } catch { return null; }
  const ev = events(root);
  const e = ev.list?.[0]?.evento;
  const inf = kid(e, "infEvento");
  if (!inf) return null;
  const ret = ev.ret || null;
  return { chNFe: txt(inf, "chNFe"), tpEvento: txt(inf, "tpEvento"), seq: txt(inf, "nSeqEvento"), author: txt(inf, "CNPJ") || txt(inf, "CPF"), orgao: txt(kid(inf, "detEvento"), "cOrgaoAutor"), nProt: ret ? txt(ret, "nProt") : "" };
}

/**
 * Check a presumed-credit appropriation event (211110). `opts.nfe` = the text of the NF-e the
 * event refers to, optional. Returns { findings, skipped, meta }.
 */
export function checkNfeEvent(text, opts = {}) {
  const findings = [], skipped = [];
  let root;
  try { root = parseCfdiXml(text).root; } catch (e) {
    return { findings: [finding("BRE-001", `The file could not be read as XML: ${e.message}.`, "Export the event again.", "/")], skipped, meta: {} };
  }
  const ev = events(root);
  if (ev.error) return { findings: [finding("BRE-001", ev.error, "Check this is an NF-e event file (envEvento, evento or procEventoNFe).", "/")], skipped, meta: {} };
  if (!ev.list.length || !ev.list[0].evento) return { findings: [finding("BRE-002", "The file has no evento.", "Put the event inside envEvento/evento.", "/")], skipped, meta: {} };
  if (root.name === "envEvento" && ev.list.length > 20) findings.push(finding("BRE-002", `envEvento holds ${ev.list.length} events; a batch holds at most 20.`, "Split the batch.", "/envEvento"));
  const nfe = opts.nfe ? readNfe(opts.nfe) : null;
  if (opts.nfe && !nfe) skipped.push("the NF-e given with the event could not be read; the checks against it were skipped");
  const metas = ev.list.map((e) => checkOne(e, opts.nfe ? nfe : null, findings, skipped));
  // The same event (type, key, sequence) twice in one batch: SEFAZ rejects the second as a
  // duplicate (cStat 573, MOC rule 3P15-10).
  const seenEv = new Map();
  metas.forEach((m, i) => {
    if (!m.tpEvento || !m.chNFe) return;
    const k = `${m.tpEvento}/${m.chNFe}/${Number(m.nSeqEvento)}`;
    if (seenEv.has(k)) findings.push(finding("BRE-015", `Event ${i + 1} repeats event ${seenEv.get(k) + 1}: the same tpEvento ${m.tpEvento}, chNFe and nSeqEvento ${m.nSeqEvento} (SEFAZ cStat 573, duplicate event).`, "Give a corrected event the next nSeqEvento, or drop the copy.", `${ev.list[i].path}/infEvento/nSeqEvento`));
    else seenEv.set(k, i);
  });
  // A cancellation (110001) against the event it cancels, when that event is given.
  if (opts.cancelled) {
    const orig = readEventSummary(opts.cancelled);
    for (const m of metas) {
      if (!m.cancel) continue;
      if (!orig) { skipped.push("the event given as the one cancelled could not be read; the checks against it were skipped"); break; }
      const note = checkCancelAgainst(m.cancel, orig, findings);
      if (note) skipped.push(note);
    }
  } else if (metas.some((m) => m.cancel)) {
    skipped.push("the event this cancellation cancels was not given, so its sequence number (459), author (1113), cOrgaoAutor (1178) and protocol (460) were not compared; add its procEventoNFe to the same check");
  }
  const meta = { ...metas[0], events: ev.list.length, root: root.name, types: [...new Set(metas.map((m) => m.tpEvento).filter(Boolean))] };
  if (ev.ret) {
    meta.cStat = txt(ev.ret, "cStat");
    meta.registered = ["135", "136"].includes(meta.cStat);
  }
  if (nfe && metas[0].chNFe && nfe.key !== metas[0].chNFe) skipped.push(`the NF-e given has key ${nfe.key}, not the event's chNFe; the checks against it were skipped`);
  return { findings, skipped, meta };
}

/**
 * Rewrite a v1.20/v1.30 event (gCredPres/vBC/gIBS/gCBS) into the v1.40 layout
 * (gCredPresOper/vBCCredPres/cCredPres/gIBSCredPres/gCBSCredPres). Returns
 * { xml, changed, problems }: an item whose IBS and CBS groups carry different codes cannot
 * be held by v1.40 (one cCredPres per item) and is left as it is, with a problem named.
 * Works on the text, so formatting, the rest of the file and namespace prefixes are kept;
 * a signature over the old content no longer verifies, so re-sign after.
 */
export function convertCredPresEvent(text) {
  const problems = [];
  let changed = 0;
  const xml = String(text).replace(/<((?:[A-Za-z0-9_]+:)?)gCredPres(\s[^>]*)?>([\s\S]*?)<\/\1gCredPres>/g, (all, pfx, attrs = "", body) => {
    const p = pfx.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const grp = (name) => new RegExp(`<${p}${name}>([\\s\\S]*?)</${p}${name}>`).exec(body);
    const field = (s, name) => new RegExp(`<${p}${name}>([^<]*)</${p}${name}>`).exec(s)?.[1];
    const ibs = grp("gIBS"), cbs = grp("gCBS");
    const codes = [ibs, cbs].filter(Boolean).map((m) => (field(m[1], "cCredPres") ?? "").trim());
    const item = (/nItem="([^"]*)"/.exec(attrs) || [])[1] ?? "?";
    if (!codes.length) { problems.push(`item ${item}: neither gIBS nor gCBS, so no cCredPres to carry over`); return all; }
    if (new Set(codes).size > 1) { problems.push(`item ${item}: gIBS gives cCredPres ${codes[0]} and gCBS ${codes[1]}; v1.40 holds one code per item, so it was left unchanged`); return all; }
    const vbc = field(body, "vBC");
    if (vbc === undefined) { problems.push(`item ${item}: no vBC`); return all; }
    const lead = (/^(\s*)/.exec(body) || ["", ""])[1];
    const ind = lead.replace(/^\r?\n/, "");
    const nl = lead.startsWith("\n") || lead.startsWith("\r\n") ? lead.match(/^\r?\n/)[0] : "";
    const tail = (/(\s*)$/.exec(body) || ["", ""])[1];
    const part = (m, name) => {
      if (!m) return "";
      const inner = m[1].replace(new RegExp(`\\s*<${p}cCredPres>[^<]*</${p}cCredPres>`), "");
      return `${nl}${ind}<${pfx}${name}>${inner}</${pfx}${name}>`;
    };
    changed++;
    return `<${pfx}gCredPresOper${attrs}>${nl}${ind}<${pfx}vBCCredPres>${vbc}</${pfx}vBCCredPres>${nl}${ind}<${pfx}cCredPres>${codes[0]}</${pfx}cCredPres>${part(ibs, "gIBSCredPres")}${part(cbs, "gCBSCredPres")}${tail}</${pfx}gCredPresOper>`;
  });
  return { xml, changed, problems };
}
