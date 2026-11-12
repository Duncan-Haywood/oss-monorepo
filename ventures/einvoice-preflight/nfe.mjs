// Offline checks for a Brazilian NF-e or NFC-e 4.00 XML file (models 55 and 65): the
// <NFe> a system sends to SEFAZ, or the authorised <nfeProc> it gets back. NF-e is not
// EN 16931, so none of the UBL/CII rules apply. Rule ids are BR-nnn and are this tool's
// own; where a rule matches a SEFAZ rejection, the finding names that cStat (texts from
// nfephp-org/sped-nfe docs/cStat.md, MIT). Layers:
//   1. the schema (BR-002..BR-005): each element's children against the content model,
//      attributes, and each value's enumerations, patterns and lengths, read from
//      leiauteNFe_v4.00.xsd, tiposBasico_v4.00.xsd and DFeTiposBasicos_v1.00.xsd (package
//      PL_010_V1.30, the tax-reform layout, which also accepts PL_009_V4 files) by
//      build-nfe-schema.mjs;
//   2. the access key (BR-010..BR-012): the Id's 44 digits, its check digit, and each part
//      against ide and emit;
//   3. identifiers (BR-013): CNPJ and CPF check digits (brazil.mjs);
//   4. the sums (BR-020..BR-031): each item's vProd against qCom x vUnCom, the ICMSTot
//      totals against the items, vNF against its parts the way sped-nfe's Make.php
//      totals it, and an NFC-e's payments against vNF;
//   5. consistency (BR-040..BR-042): cUF against the issuer's state and city, CFOP's first
//      digit against tpNF and idDest.
//   6. the tax-reform sums (BR-050..BR-052, NT 2025.002-RTC): each item's vIBS against
//      vIBSUF + vIBSMun, every IBSCBSTot and ISTot total against the items, and vNFTot
//      against the items' vItem. No SEFAZ rejection code for these was read, so none is
//      named; the sums follow the schema's own field notes and sped-nfe's totaliser.
// An offline observation, not SEFAZ's authorisation, and not tax advice.

import { COMPLEX, SIMPLE } from "./nfe-xsd-data.mjs";
import { checkBrazilId } from "./brazil.mjs";
import { parseCfdiXml } from "./cfdi-xml.mjs";

export const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function looksLikeNfe(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?(?:NFe|nfeProc)[\s>]/.test(head) && head.includes(NFE_NS);
}

// ---------- schema layer ----------

const patternCache = new Map();
function patternOk(patterns, v) {
  const key = patterns.join("\u0000");
  if (!patternCache.has(key)) {
    try { patternCache.set(key, new RegExp(`^(?:${patterns.map((p) => `(?:${p})`).join("|")})$`, "u")); } catch { patternCache.set(key, null); }
  }
  const re = patternCache.get(key);
  return re ? re.test(v) : true;
}

const ALNUM_CNPJ = /^[0-9A-Z]{12}\d{2}$/;
const ALNUM_KEY = /^\d{6}[0-9A-Z]{12}\d{26}$/;

/** Why `v` does not fit simple type `id`, or "". */
export function valueProblem(id, v, name = "") {
  if (!id || id.startsWith("#")) return "";
  const t = SIMPLE[id];
  if (!t) return "";
  // The alphanumeric CNPJ (NT 2025.001, from July 2026) postdates the schema's digit-only
  // patterns: accept its shape in a CNPJ, and in an access key's CNPJ positions.
  if (/CNPJ/.test(name) && ALNUM_CNPJ.test(v)) return "";
  if (/^(chNFe|refNFe|refNFeSig)$/.test(name) && ALNUM_KEY.test(v)) return "";
  const len = [...v].length;
  if (t.enum && !t.enum.includes(v)) return `is not one of the codes the schema allows (${t.enum.length <= 12 ? t.enum.join(", ") : `${t.enum.length} codes`})`;
  if (t.length !== undefined && len !== t.length) return `should be ${t.length} characters long, not ${len}`;
  if (t.minLength !== undefined && len < t.minLength) return `is shorter than ${t.minLength} characters`;
  if (t.maxLength !== undefined && len > t.maxLength) return `is longer than ${t.maxLength} characters (${len})`;
  if (t.patterns && !patternOk(t.patterns, v)) return /[\n\r\t]/.test(v) ? "contains a line break or tab, which the schema's pattern does not allow" : /^\s|\s$/.test(v) ? "starts or ends with a space, which the schema's pattern does not allow" : `does not match the schema's pattern${id.startsWith("@") ? ` (${id.slice(1)})` : ""}`;
  return t.base?.startsWith("@") ? valueProblem(t.base, v, name) : "";
}

const named = (kids) => kids.filter((c) => c.name);

function checkComplex(node, typeId, path, out, skipped) {
  const def = COMPLEX[typeId];
  if (!def) return;
  const label = node.name;
  const known = new Set(def.attrs.map((a) => a.n));
  for (const a of def.attrs) {
    const v = node.attrs[a.n];
    if (v === undefined) {
      if (a.req) out.push(finding("BR-003", `${label} is missing the required attribute ${a.n}.`, `Add ${a.n} (required by leiauteNFe_v4.00.xsd).`, `${path}/@${a.n}`));
      continue;
    }
    const why = valueProblem(a.t, v, a.n);
    if (why) out.push(finding("BR-004", `${a.n} on ${label} ${why}.`, `Correct ${a.n} to a value the NF-e 4.00 schema accepts.`, `${path}/@${a.n}`));
  }
  for (const k of Object.keys(node.attrs)) {
    if (k.includes(":") || known.has(k)) continue;
    out.push(finding("BR-003", `${label} carries an attribute the schema does not define: ${k}.`, `Remove ${k} or check its spelling.`, `${path}/@${k}`));
  }
  const kids = named(node.children);
  const counted = kids;
  const unknown = counted.filter((c) => !def.kids[c.name] || c.ns !== NFE_NS && c.name !== "Signature");
  for (const c of unknown) out.push(finding("BR-002", `${label} contains an element the NF-e 4.00 schema does not allow there: ${c.name}.`, "Remove it or check its spelling and namespace (element names are case-sensitive).", `${path}/${c.name}`));
  if (!unknown.length) {
    const tokens = counted.map((c) => `<${c.name}>`).join("");
    if (!new RegExp(`^${def.model}$`).test(tokens)) {
      const have = new Set(counted.map((c) => c.name));
      const missing = (def.req || []).filter((n) => !have.has(n));
      if (missing.length === 1 && missing[0] === "Signature" && new RegExp(`^${def.model}$`).test(tokens + "<Signature>")) {
        skipped.push("signature: the NF-e is not signed yet (no ds:Signature); SEFAZ needs it signed, and the signature itself is never checked here");
      } else if (missing.length) out.push(finding("BR-002", `${label} is missing the required element${missing.length > 1 ? "s" : ""} ${missing.join(", ")}.`, "Add it (required by leiauteNFe_v4.00.xsd); SEFAZ rejects a file that fails the schema (cStat 225).", `${path}/${missing[0]}`));
      else out.push(finding("BR-002", `The elements inside ${label} are not in the order or number the NF-e 4.00 schema allows (found ${counted.map((c) => c.name).join(", ") || "none"}; the schema's order is ${Object.keys(def.kids).join(", ")}, some of them alternatives).`, "Reorder or remove elements to fit the schema; SEFAZ rejects a file that fails the schema (cStat 225).", path));
    }
  }
  // The schema's two xs:unique keys: det/@nItem inside infNFe, forDia/@dia inside cana.
  const uniq = { infNFe: "nItem", cana: "dia" }[label];
  if (uniq) {
    const vals = new Set();
    for (const c of counted) {
      const v = c.attrs[uniq];
      if (v === undefined) continue;
      if (vals.has(v)) out.push(finding("BR-002", `Two ${c.name} elements inside ${label} share ${uniq}="${v}"; the schema requires each to be unique.`, `Number the ${c.name} elements without repeats.`, `${path}/${c.name}`));
      vals.add(v);
    }
  }
  const seen = {};
  for (const c of counted) {
    const t = def.kids[c.name];
    if (!t || unknown.includes(c)) continue;
    seen[c.name] = (seen[c.name] || 0) + 1;
    const p = `${path}/${c.name}${seen[c.name] > 1 || c.name === "det" || c.name === "pag" || c.name === "detPag" ? `[${seen[c.name]}]` : ""}`;
    if (t.any) continue;
    if (t.c) { checkComplex(c, t.c, p, out, skipped); continue; }
    if (named(c.children).length) { out.push(finding("BR-002", `${c.name} should hold a value, not elements.`, "Check the file's structure.", p)); continue; }
    const why = valueProblem(t.s, c.text, c.name);
    if (why) out.push(finding("BR-004", `${c.name} "${c.text.length > 60 ? c.text.slice(0, 57) + "..." : c.text}" ${why}.`, `Correct ${c.name} to a value the NF-e 4.00 schema accepts; SEFAZ rejects a file that fails the schema (cStat 225).`, p));
  }
}

// ---------- helpers ----------

const kid = (n, name) => n?.children.find((c) => c.name === name);
const kidsOf = (n, name) => (n?.children || []).filter((c) => c.name === name);
const txt = (n, name) => (kid(n, name)?.text ?? "").trim();
const descend = (n, ...names) => names.reduce((x, k) => kid(x, k), n);

// Decimal string to integer units at `scale` decimals; NaN if not a number.
function units(s, scale = 2) {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(String(s ?? "").trim());
  if (!m || (!m[2] && !m[3])) return NaN;
  const frac = (m[3] || "").padEnd(scale, "0");
  if (frac.length > scale && /[1-9]/.test(frac.slice(scale))) return NaN;
  const v = Number(m[2] || "0") * 10 ** scale + Number(frac.slice(0, scale) || "0");
  return m[1] === "-" ? -v : v;
}
const cents = (s) => (s === "" || s === undefined ? 0 : units(s, 2));
const money = (c) => (c / 100).toFixed(2);

// ---------- access key ----------

export function keyCheckDigit(first43) {
  let sum = 0, w = 2;
  for (let i = first43.length - 1; i >= 0; i--) {
    sum += (first43.charCodeAt(i) - 48) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

// IBGE state codes, the first two digits of cUF, cMunFG and every cMun.
export const UF_CODE = { RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17", MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41", SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53" };

function checkKey(inf, ide, emit, out, skipped) {
  const id = inf.attrs.Id || "";
  const base = "/NFe/infNFe";
  if (!id.startsWith("NFe")) { out.push(finding("BR-010", `The infNFe Id "${id}" does not start with the literal NFe (SEFAZ cStat 227).`, "Set Id to NFe followed by the 44-character access key.", `${base}/@Id`)); return; }
  const key = id.slice(3);
  if (ALNUM_KEY.test(key) && !/^\d{44}$/.test(key)) {
    skipped.push("access key check digit: the key carries an alphanumeric CNPJ (NT 2025.001); its digit rule was not read, so the digit is not checked");
  } else if (!/^\d{44}$/.test(key)) {
    out.push(finding("BR-010", `The access key in Id has ${key.length} characters; it needs 44 digits.`, "Rebuild the key from ide and emit (cUF, AAMM, CNPJ, mod, serie, nNF, tpEmis, cNF, cDV).", `${base}/@Id`));
    return;
  } else {
    const dv = keyCheckDigit(key.slice(0, 43));
    if (String(dv) !== key[43]) out.push(finding("BR-011", `The access key's check digit is ${key[43]}; the other 43 digits give ${dv} (SEFAZ cStat 236).`, "Recompute cDV (mod 11, weights 2 to 9 from the right) and set it in both the key and ide/cDV.", `${base}/@Id`));
  }
  const parts = [
    ["cUF", key.slice(0, 2), txt(ide, "cUF"), "ide/cUF"],
    ["year and month", key.slice(2, 6), (() => { const m = /^\d{2}(\d{2})-(\d{2})/.exec(txt(ide, "dhEmi")); return m ? m[1] + m[2] : ""; })(), "ide/dhEmi"],
    ["issuer CNPJ/CPF", key.slice(6, 20), (txt(emit, "CNPJ") || (txt(emit, "CPF") ? "000" + txt(emit, "CPF") : "")), "emit/CNPJ"],
    ["mod", key.slice(20, 22), txt(ide, "mod"), "ide/mod"],
    ["serie", key.slice(22, 25), txt(ide, "serie").padStart(3, "0"), "ide/serie"],
    ["nNF", key.slice(25, 34), txt(ide, "nNF").padStart(9, "0"), "ide/nNF"],
    ["tpEmis", key.slice(34, 35), txt(ide, "tpEmis"), "ide/tpEmis"],
    ["cNF", key.slice(35, 43), txt(ide, "cNF").padStart(8, "0"), "ide/cNF"],
    ["cDV", key.slice(43, 44), txt(ide, "cDV"), "ide/cDV"],
  ];
  for (const [what, inKey, inFile, where] of parts) {
    if (!inFile || inKey === inFile) continue;
    out.push(finding("BR-012", `The access key's ${what} is ${inKey} but ${where} gives ${inFile} (SEFAZ cStat 502: the Id is not the concatenation of its fields).`, `Rebuild the key from the file's own fields, or correct ${where}.`, `${base}/${where}`));
  }
}

// ---------- sums ----------

const ICMS_SUMS = [
  ["vBC", "vBC", "531"], ["vICMS", "vICMS", "532"], ["vICMSDeson", "vICMSDeson", "795"],
  ["vBCST", "vBCST", "533"], ["vST", "vICMSST", "534"], ["vFCP", "vFCP", null], ["vFCPST", "vFCPST", null],
];
const PROD_SUMS = [["vFrete", "535"], ["vSeg", "536"], ["vDesc", "537"], ["vOutro", "604"]];

function checkSums(inf, ide, out) {
  const dets = kidsOf(inf, "det");
  const tot = descend(inf, "total", "ICMSTot");
  if (!tot) return;
  const T = "/NFe/infNFe/total/ICMSTot";
  const acc = {};
  const add = (k, v) => { acc[k] = (acc[k] || 0) + (Number.isNaN(v) ? 0 : v); };
  let deduzDeson = false;
  dets.forEach((det, i) => {
    const prod = kid(det, "prod"), imp = kid(det, "imposto");
    const P = `/NFe/infNFe/det[${i + 1}]`;
    // item: vProd = qCom x vUnCom (cStat 629), within a cent
    const q = txt(prod, "qCom"), u = txt(prod, "vUnCom"), vp = txt(prod, "vProd");
    if (q && u && vp) {
      const qu = units(q, 4), uu = units(u, 10), vc = cents(vp);
      if (![qu, uu, vc].some(Number.isNaN)) {
        // exact product in units of 1e-14 reais against vProd in cents (1e-2): a cent is 1e12
        const diff = BigInt(qu) * BigInt(uu) - BigInt(vc) * 10n ** 12n;
        if ((diff < 0n ? -diff : diff) > 10n ** 12n) {
          const exact = Number(BigInt(qu) * BigInt(uu) / 10n ** 10n) / 1e4;
          out.push(finding("BR-020", `Item ${det.attrs.nItem || i + 1}: vProd ${vp} is not qCom ${q} x vUnCom ${u} = ${exact.toFixed(4)}; it is more than a cent off (SEFAZ cStat 629).`, "Recompute vProd as qCom x vUnCom rounded to the cent, or correct the quantity or unit price.", `${P}/prod/vProd`));
        }
      }
    }
    if (txt(prod, "indTot") === "1") add("vProd", cents(vp));
    for (const [k] of PROD_SUMS) add(k, cents(txt(prod, k)));
    const icmsGroup = named(kid(imp, "ICMS")?.children || [])[0];
    if (icmsGroup) {
      for (const [k, src] of ICMS_SUMS) add(k, cents(txt(icmsGroup, src)));
      add("vICMSMonoReten", cents(txt(icmsGroup, "vICMSMonoReten")));
      if (txt(icmsGroup, "indDeduzDeson") === "1") { deduzDeson = true; add("deson", cents(txt(icmsGroup, "vICMSDeson"))); }
    }
    add("vII", cents(txt(kid(imp, "II"), "vII")));
    add("vIPI", cents(txt(descend(imp, "IPI", "IPITrib"), "vIPI")));
    add("vIPIDevol", cents(txt(descend(det, "impostoDevol", "IPI"), "vIPIDevol")));
    if (!kid(imp, "ISSQN")) {
      add("vPIS", cents(txt(named(kid(imp, "PIS")?.children || [])[0], "vPIS")));
      add("vCOFINS", cents(txt(named(kid(imp, "COFINS")?.children || [])[0], "vCOFINS")));
    }
    const pisst = kid(imp, "PISST"), cofst = kid(imp, "COFINSST");
    if (txt(pisst, "indSomaPISST") === "1") add("vPISST", cents(txt(pisst, "vPIS")));
    if (txt(cofst, "indSomaCOFINSST") === "1") add("vCOFINSST", cents(txt(cofst, "vCOFINS")));
    if (kid(imp, "vTotTrib")) add("vTotTrib", cents(txt(imp, "vTotTrib")));
  });
  const checks = [["vProd", "564"], ...ICMS_SUMS.map(([k, , c]) => [k, c]), ...PROD_SUMS, ["vII", "601"], ["vIPI", "538"], ["vIPIDevol", null], ["vPIS", "602"], ["vCOFINS", "603"], ["vTotTrib", "685"]];
  for (const [k, cstat] of checks) {
    const el = kid(tot, k);
    if (!el) continue;
    const have = cents(el.text), want = acc[k] || 0;
    if (Number.isNaN(have) || have === want) continue;
    if (k === "vTotTrib" && have === 0) continue;
    out.push(finding("BR-021", `ICMSTot/${k} is ${el.text.trim()} but the items add up to ${money(want)}${cstat ? ` (SEFAZ cStat ${cstat})` : ""}.`, `Set ${k} to the sum of the items' ${k}, or correct the item that is off.`, `${T}/${k}`));
  }
  // vNF from its parts (sped-nfe Make.php buildTotalICMS; vServ from ISSQNtot).
  const g = (k) => cents(txt(tot, k));
  const vServ = cents(txt(descend(inf, "total", "ISSQNtot"), "vServ"));
  const want = g("vProd") - g("vDesc") - (deduzDeson ? (acc.deson || 0) : 0) + g("vST") + g("vFCPST") + (acc.vICMSMonoReten || 0)
    + g("vFrete") + g("vSeg") + g("vOutro") + g("vII") + g("vIPI") + g("vIPIDevol") + vServ + (acc.vPISST || 0) + (acc.vCOFINSST || 0);
  const vNF = g("vNF");
  const veic = dets.some((d) => txt(descend(d, "prod", "veicProd"), "tpOp") === "2");
  // Import duty: Make.php adds vII, but an authorised Santa Catarina import NF-e in nfelib's
  // samples (eval/nfe-corpus/nfelib/42210775..., cStat 100, tpAmb 1, vII R$ 13,921.27) has
  // vNF = vProd + vIPI + vOutro, the duty already inside vProd; SEFAZ accepted it, so vNF
  // passes with or without vII (eval/nfe-corpus.mjs, 2026-11-12).
  const withoutII = want - g("vII");
  if (!Number.isNaN(vNF) && !Number.isNaN(want) && vNF !== want && !(g("vII") && vNF === withoutII) && !veic) {
    out.push(finding("BR-030", `vNF is ${money(vNF)} but its parts give ${money(want)} (vProd - vDesc${deduzDeson ? " - vICMSDeson" : ""} + vST + vFCPST + vFrete + vSeg + vOutro + vII + vIPI + vIPIDevol + vServ${acc.vPISST || acc.vCOFINSST ? " + PIS/COFINS-ST" : ""}; SEFAZ cStat 610).`,
      "Recompute vNF from the totals, or correct the total that is off.", `${T}/vNF`));
  }
  // NFC-e: payments less change equal vNF (cStat 767), unless "sem pagamento" (90).
  if (txt(ide, "mod") === "65") {
    const pag = kid(inf, "pag");
    const det = kidsOf(pag, "detPag");
    if (det.length && !det.some((d) => txt(d, "tPag") === "90")) {
      const paid = det.reduce((s, d) => s + cents(txt(d, "vPag")), 0) - cents(txt(pag, "vTroco"));
      if (!Number.isNaN(paid) && paid !== vNF) out.push(finding("BR-031", `The NFC-e's payments less change come to ${money(paid)}, not vNF ${money(vNF)} (SEFAZ cStat 767).`, "Make the detPag amounts, less vTroco, equal vNF.", "/NFe/infNFe/pag"));
    }
  }
}

// ---------- tax reform (IBS, CBS, IS) ----------

// Sum of every element named `name` under `node` (any depth), in cents; null when none.
function sumDeep(node, name) {
  let total = null;
  (function walk(n) {
    for (const c of n?.children || []) {
      if (!c.name) continue;
      if (c.name === name && !named(c.children).length) { const v = cents(c.text); if (!Number.isNaN(v)) total = (total ?? 0) + v; }
      else walk(c);
    }
  })(node);
  return total;
}

// Each IBSCBSTot (or ISTot) field: [path under the total, how to read one item's part].
// The item side follows the schema's field notes ("Valor total do IBS", "Total do
// Diferimento" and so on, DFeTiposBasicos_v1.00.xsd) and sped-nfe's totaliser
// (TraitTagDetIBSCBS.php: vBCIBSCBS, gIBSUF, gIBSMun and gCBS add up each item's gIBSCBS,
// and gIBS/vIBS adds vIBSUF + vIBSMun; the credit, monophase and reversal groups add up
// their item groups the same way).
const REFORM_SUMS = [
  ["vBCIBSCBS", (g) => sumDeep(g.ibscbs, "vBC")],
  ["gIBS/gIBSUF/vDif", (g) => sumDeep(kid(g.ibscbs, "gIBSUF"), "vDif")],
  ["gIBS/gIBSUF/vDevTrib", (g) => sumDeep(kid(g.ibscbs, "gIBSUF"), "vDevTrib")],
  ["gIBS/gIBSUF/vIBSUF", (g) => sumDeep(kid(g.ibscbs, "gIBSUF"), "vIBSUF")],
  ["gIBS/gIBSMun/vDif", (g) => sumDeep(kid(g.ibscbs, "gIBSMun"), "vDif")],
  ["gIBS/gIBSMun/vDevTrib", (g) => sumDeep(kid(g.ibscbs, "gIBSMun"), "vDevTrib")],
  ["gIBS/gIBSMun/vIBSMun", (g) => sumDeep(kid(g.ibscbs, "gIBSMun"), "vIBSMun")],
  ["gIBS/vIBS", (g) => g.ibscbs ? (sumDeep(kid(g.ibscbs, "gIBSUF"), "vIBSUF") ?? 0) + (sumDeep(kid(g.ibscbs, "gIBSMun"), "vIBSMun") ?? 0) : null],
  ["gIBS/vCredPres", (g) => sumDeep(kid(g.credPres, "gIBSCredPres"), "vCredPres")],
  ["gIBS/vCredPresCondSus", (g) => sumDeep(kid(g.credPres, "gIBSCredPres"), "vCredPresCondSus")],
  ["gCBS/vDif", (g) => sumDeep(kid(g.ibscbs, "gCBS"), "vDif")],
  ["gCBS/vDevTrib", (g) => sumDeep(kid(g.ibscbs, "gCBS"), "vDevTrib")],
  ["gCBS/vCBS", (g) => sumDeep(kid(g.ibscbs, "gCBS"), "vCBS")],
  ["gCBS/vCredPres", (g) => sumDeep(kid(g.credPres, "gCBSCredPres"), "vCredPres")],
  ["gCBS/vCredPresCondSus", (g) => sumDeep(kid(g.credPres, "gCBSCredPres"), "vCredPresCondSus")],
  ...["vIBSMono", "vCBSMono", "vIBSMonoReten", "vCBSMonoReten", "vIBSMonoRet", "vCBSMonoRet"].map((k) => [`gMono/${k}`, (g) => sumDeep(g.mono, k)]),
  ["gEstornoCred/vIBSEstCred", (g) => sumDeep(g.estorno, "vIBSEstCred")],
  ["gEstornoCred/vCBSEstCred", (g) => sumDeep(g.estorno, "vCBSEstCred")],
];

function checkReform(inf, out) {
  const dets = kidsOf(inf, "det");
  const groups = dets.map((det) => {
    const imp = kid(det, "imposto"), t = kid(imp, "IBSCBS");
    return { det, is: kid(imp, "IS"), ibscbs: kid(t, "gIBSCBS"), credPres: kid(t, "gCredPresOper"), mono: kid(t, "gIBSCBSMono"), estorno: kid(t, "gEstornoCred") };
  });
  // Item: vIBS = vIBSUF + vIBSMun (sped-nfe's "vIBS = vIBSUF + vIBSMun").
  groups.forEach((g, i) => {
    if (!g.ibscbs || !kid(g.ibscbs, "vIBS")) return;
    const uf = cents(txt(kid(g.ibscbs, "gIBSUF"), "vIBSUF")), mun = cents(txt(kid(g.ibscbs, "gIBSMun"), "vIBSMun")), v = cents(txt(g.ibscbs, "vIBS"));
    if ([uf, mun, v].some(Number.isNaN) || v === uf + mun) return;
    out.push(finding("BR-050", `Item ${g.det.attrs.nItem || i + 1}: gIBSCBS/vIBS is ${txt(g.ibscbs, "vIBS")} but vIBSUF ${money(uf)} + vIBSMun ${money(mun)} = ${money(uf + mun)}.`,
      "Set vIBS to the state part plus the municipal part.", `/NFe/infNFe/det[${i + 1}]/imposto/IBSCBS/gIBSCBS/vIBS`));
  });
  const total = kid(inf, "total");
  const tot = kid(total, "IBSCBSTot");
  if (tot) {
    for (const [path, read] of REFORM_SUMS) {
      const el = path.split("/").reduce((n, k) => kid(n, k), tot);
      if (!el) continue;
      const have = cents(el.text);
      const want = groups.reduce((s, g) => s + (read(g) ?? 0), 0);
      if (Number.isNaN(have) || have === want) continue;
      out.push(finding("BR-051", `IBSCBSTot/${path} is ${el.text.trim()} but the items add up to ${money(want)}.`,
        `Set ${path.split("/").pop()} to the sum of the items' values, or correct the item that is off.`, `/NFe/infNFe/total/IBSCBSTot/${path}`));
    }
  }
  const isTot = kid(kid(total, "ISTot"), "vIS");
  if (isTot) {
    const have = cents(isTot.text), want = groups.reduce((s, g) => s + (cents(txt(g.is, "vIS")) || 0), 0);
    if (!Number.isNaN(have) && have !== want) out.push(finding("BR-051", `ISTot/vIS is ${isTot.text.trim()} but the items' Imposto Seletivo adds up to ${money(want)}.`,
      "Set ISTot/vIS to the sum of the items' IS/vIS, or correct the item that is off.", "/NFe/infNFe/total/ISTot/vIS"));
  }
  // vNFTot: "A soma dos itens deverá corresponder ao total da nota" (vItem, leiauteNFe).
  const vNFTot = kid(total, "vNFTot");
  if (vNFTot && dets.some((d) => kid(d, "vItem"))) {
    const have = cents(vNFTot.text);
    const want = dets.filter((d) => txt(kid(d, "prod"), "indTot") === "1").reduce((s, d) => s + (cents(txt(d, "vItem")) || 0), 0);
    if (!Number.isNaN(have) && have !== want) out.push(finding("BR-052", `vNFTot is ${vNFTot.text.trim()} but the vItem of the items that count toward the total (indTot 1) add up to ${money(want)}.`,
      "Set vNFTot to the sum of vItem, or correct the item that is off.", "/NFe/infNFe/total/vNFTot"));
  }
}

// ---------- consistency ----------

function checkConsistency(inf, ide, emit, dest, out) {
  const uf = txt(kid(emit, "enderEmit"), "UF");
  const cUF = txt(ide, "cUF");
  if (uf && UF_CODE[uf] && cUF && UF_CODE[uf] !== cUF) out.push(finding("BR-040", `ide/cUF is ${cUF} but the issuer's state is ${uf} (code ${UF_CODE[uf]}) (SEFAZ cStat 226/247).`, `Set cUF to ${UF_CODE[uf]}, the IBGE code of the issuer's state.`, "/NFe/infNFe/ide/cUF"));
  const cMun = txt(kid(emit, "enderEmit"), "cMun");
  if (uf && UF_CODE[uf] && /^\d{7}$/.test(cMun) && cMun.slice(0, 2) !== UF_CODE[uf]) out.push(finding("BR-040", `The issuer's cMun ${cMun} is not in ${uf}; IBGE city codes there start ${UF_CODE[uf]} (SEFAZ cStat 273).`, "Use the IBGE code of the issuer's city.", "/NFe/infNFe/emit/enderEmit/cMun"));
  const cMunFG = txt(ide, "cMunFG");
  if (cUF && /^\d{7}$/.test(cMunFG) && cMunFG.slice(0, 2) !== cUF) out.push(finding("BR-040", `ide/cMunFG ${cMunFG} (where the taxable event happens) is not in the state of cUF ${cUF} (SEFAZ cStat 271).`, "Use the IBGE code of the issuer's city, in the issuer's state.", "/NFe/infNFe/ide/cMunFG"));
  const tpNF = txt(ide, "tpNF"), idDest = txt(ide, "idDest");
  const outFirst = { 1: "5", 2: "6", 3: "7" }, inFirst = { 1: "1", 2: "2", 3: "3" };
  kidsOf(inf, "det").forEach((det, i) => {
    const cfop = txt(kid(det, "prod"), "CFOP");
    if (!/^\d{4}$/.test(cfop)) return;
    const P = `/NFe/infNFe/det[${i + 1}]/prod/CFOP`;
    const d = cfop[0], n = det.attrs.nItem || i + 1;
    if (tpNF === "1" && "123".includes(d)) out.push(finding("BR-041", `Item ${n}: CFOP ${cfop} is an inbound code (1, 2 or 3) on an outbound NF-e (tpNF 1) (SEFAZ cStat 518).`, "Use the outbound CFOP (5, 6 or 7) or set tpNF to 0.", P));
    else if (tpNF === "0" && "567".includes(d)) out.push(finding("BR-041", `Item ${n}: CFOP ${cfop} is an outbound code (5, 6 or 7) on an inbound NF-e (tpNF 0) (SEFAZ cStat 519).`, "Use the inbound CFOP (1, 2 or 3) or set tpNF to 1.", P));
    else {
      const want = (tpNF === "0" ? inFirst : outFirst)[idDest];
      if (want && d !== want) out.push(finding("BR-042", `Item ${n}: CFOP ${cfop} starts ${d}, but idDest ${idDest} (${{ 1: "within the state", 2: "interstate", 3: "abroad" }[idDest]}) calls for CFOPs starting ${want}.`, `Use a ${want}xxx CFOP or correct idDest.`, P));
    }
  });
  void dest;
}

// ---------- entry ----------

/** Check an NF-e/NFC-e 4.00 file. Returns {findings, skipped, meta}. */
export function checkNfe(text) {
  const findings = [], skipped = [];
  let root;
  try { root = parseCfdiXml(text).root; } catch (e) {
    return { findings: [finding("BR-001", `The file could not be read as XML: ${e.message}.`, "Export the NF-e again from the issuing system.", "/")], skipped, meta: {} };
  }
  if (!root || !["NFe", "nfeProc"].includes(root.name) || root.ns !== NFE_NS) {
    return { findings: [finding("BR-001", "The root element is not NFe or nfeProc in the namespace http://www.portalfiscal.inf.br/nfe.", "Check this is an NF-e or NFC-e XML file.", "/")], skipped, meta: {} };
  }
  const nfe = root.name === "nfeProc" ? kid(root, "NFe") : root;
  const inf = kid(nfe, "infNFe");
  const versao = inf?.attrs.versao || root.attrs.versao || "";
  if (!inf) return { findings: [finding("BR-002", "The file has no infNFe, the element that holds the whole NF-e.", "Export the NF-e again from the issuing system.", "/NFe/infNFe")], skipped, meta: {} };
  if (versao !== "4.00") {
    return { findings: [finding("BR-001", `This is NF-e version ${versao || "(none)"}; SEFAZ accepts layout 4.00 and this checker reads 4.00 only.`, "Reissue the document on layout 4.00.", "/NFe/infNFe/@versao")], skipped, meta: { versao } };
  }
  if (root.name === "nfeProc") checkComplex(root, "TNfeProc", "/nfeProc", findings, skipped);
  else checkComplex(root, "TNFe", "/NFe", findings, skipped);
  if (root.name === "nfeProc") for (const f of findings) f.path = f.path.replace(/^\/nfeProc\/NFe/, "/NFe");

  const ide = kid(inf, "ide"), emit = kid(inf, "emit"), dest = kid(inf, "dest");
  const prot = descend(root, "protNFe", "infProt");
  const meta = {
    versao, mod: txt(ide, "mod"), tpAmb: txt(ide, "tpAmb"), items: kidsOf(inf, "det").length,
    authorised: !!prot && txt(prot, "cStat") === "100", key: (inf?.attrs.Id || "").slice(3),
  };
  if (!ide || !emit) return { findings, skipped, meta };

  checkKey(inf, ide, emit, findings, skipped);
  if (prot && txt(prot, "chNFe") && txt(prot, "chNFe") !== meta.key) findings.push(finding("BR-012", `protNFe/chNFe ${txt(prot, "chNFe")} is not this NF-e's key ${meta.key}: the protocol belongs to another document.`, "Attach the protocol SEFAZ returned for this key.", "/nfeProc/protNFe/infProt/chNFe"));

  // CNPJ/CPF check digits (shape errors are the schema's).
  for (const [node, where, cnpj, cpf] of [[emit, "emit", "207", null], [dest, "dest", "208", "237"]]) {
    for (const k of ["CNPJ", "CPF"]) {
      const v = txt(node, k);
      if (!v) continue;
      const r = checkBrazilId(v);
      if (!r.ok && (r.kind === "cpf" || r.kind?.startsWith("cnpj"))) {
        const code = k === "CNPJ" ? cnpj : cpf;
        findings.push(finding("BR-013", `The ${where === "emit" ? "issuer's" : "customer's"} ${k} ${v}: ${r.problems[0]}${code ? ` (SEFAZ cStat ${code})` : ""}`, `Copy the ${k} from the party's registration (cartão CNPJ or CPF card).`, `/NFe/infNFe/${where}/${k}`));
      }
    }
  }
  checkSums(inf, ide, findings);
  checkReform(inf, findings);
  checkConsistency(inf, ide, emit, dest, findings);
  return { findings, skipped, meta };
}
