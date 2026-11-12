// Offline checks for a Brazilian national NFS-e file (the Padrão Nacional of the Sistema
// Nacional NFS-e, run by the Receita Federal for services): the <DPS> (Declaração de
// Prestação de Serviços) a provider's system sends, or the <NFSe> the national system
// returns with the DPS inside it. Like NF-e it is not EN 16931, so none of the UBL/CII
// rules apply. Rule ids are NFSE-nnn and are this tool's own; no rejection code of the
// national system was read, so none is named. Layers:
//   1. the schema (NFSE-002..NFSE-004): each element's children against the content model,
//      attributes, and each value's enumerations, patterns and lengths, read from
//      DPS_v1.01.xsd, NFSe_v1.01.xsd, tiposComplexos_v1.01.xsd and tiposSimples_v1.01.xsd
//      (package NFSe-ESQUEMAS_XSD-RTC-v1.02-20261020, leiaute 1.04.01, the IBS/CBS reform
//      layout) by build-nfse-schema.mjs;
//   2. the identifiers (NFSE-010..NFSE-013): the DPS Id against cLocEmi, the issuer's
//      CNPJ/CPF, serie and nDPS, as the schema's TSIdDPS note composes it; the NFS-e access
//      key's 50 digits against ambGer, the issuer, nNFSe and the month, and its check digit
//      (mod 11 as in NF-e: reproduces all three keys of real authorised NFS-e found and
//      nfelib's sample); CNPJ and CPF check digits (brazil.mjs);
//   3. the ISSQN sums (NFSE-020..NFSE-023), each as the schema's own field note states it:
//      vBC = vServ - vDescIncond - adjustment - municipal benefit; vISSQN = vBC x pAliqAplic;
//      vTotalRet = vRetCP + vRetIRRF + vRetCSLL + retained ISSQN; vLiq = vServ - vDescCond
//      - vDescIncond - vTotalRet;
//   4. the IBS/CBS sums (NFSE-030..NFSE-033): the reform base (to 2026 net of ISSQN, PIS
//      and COFINS; 2027-2032 net of ISSQN), each tax at its effective rate, vIBSTot =
//      vIBSUF + vIBSMun, and vTotNF (vLiq in 2026, plus IBS and CBS from 2027).
// An offline observation, not the national system's authorisation, and not tax advice.

import { COMPLEX, SIMPLE, PACKAGE } from "./nfse-xsd-data.mjs";
import { checkBrazilId } from "./brazil.mjs";
import { parseCfdiXml } from "./cfdi-xml.mjs";
import { keyCheckDigit } from "./nfe.mjs";

export const NFSE_NS = "http://www.sped.fazenda.gov.br/nfse";
export { PACKAGE };

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function looksLikeNfse(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?(?:DPS|NFSe)[\s>]/.test(head) && head.includes(NFSE_NS);
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

/** Why `v` does not fit simple type `id`, or "". */
export function valueProblem(id, v) {
  if (!id || id.startsWith("#")) return "";
  const t = SIMPLE[id];
  if (!t) return "";
  const len = [...v].length;
  if (t.enum && !t.enum.includes(v)) return `is not one of the codes the schema allows (${t.enum.length <= 12 ? t.enum.join(", ") : `${t.enum.length} codes`})`;
  if (t.length !== undefined && len !== t.length) return `should be ${t.length} characters long, not ${len}`;
  if (t.minLength !== undefined && len < t.minLength) return `is shorter than ${t.minLength} characters`;
  if (t.maxLength !== undefined && len > t.maxLength) return `is longer than ${t.maxLength} characters (${len})`;
  if (t.patterns && !patternOk(t.patterns, v)) return /[\n\r\t]/.test(v) ? "contains a line break or tab, which the schema's pattern does not allow" : /^\s|\s$/.test(v) ? "starts or ends with a space, which the schema's pattern does not allow" : `does not match the schema's pattern${id.startsWith("@") ? ` (${id.slice(1)})` : ""}`;
  return t.base?.startsWith("@") ? valueProblem(t.base, v) : "";
}

const named = (kids) => kids.filter((c) => c.name);
const REPEATED = new Set(["docDedRed", "docNFNFS", "documentos", "gItemPed", "itemPed", "docOutNFSe", "docFiscalOutro", "docOutro", "fornec", "dFeNacional"]);

// Elements a newer layout made required: named in the fix so an issuer on an older
// layout knows why a file the system once took now fails (CHANGELOG_SCHEMAS.md of nfelib
// for the 2026-10-20 package: "finNFSe at infDPS").
const NEWLY_REQUIRED = {
  finNFSe: "finNFSe (0 for a regular NFS-e) is required by the 2026-10-20 schema package (leiaute 1.04.01, NT SE/CGNFS-e 009); files built to an earlier layout lack it. It goes after tpEmit (and cMotivoEmisTI, if present), before cLocEmi.",
};

// Elements the 2026-10-20 package moved: a file from an earlier layout trips the schema on
// them, and the fix says where each now goes (read from the two layouts' files: nfelib's
// pre-RTC samples and an ERP's December 2025 RTC file against this package).
const MOVED = {
  "IBSCBS/finNFSe": "finNFSe moved out of IBSCBS: it now sits in infDPS, after tpEmit and before cLocEmi (2026-10-20 package, leiaute 1.04.01).",
  "gIBSCBS/CST": "CST and cClassTrib moved out of gIBSCBS: they now open trib (trib/CST, trib/cClassTrib, then gIBSCBS) in the 2026-10-20 package.",
  "valores/vCalcReeRepRes": "vCalcReeRepRes (reimbursements and pass-throughs, an earlier RTC layout's field) is not in the 2026-10-20 package at all; remove it.",
  "gIBSCBS/cClassTrib": "CST and cClassTrib moved out of gIBSCBS: they now open trib (trib/CST, trib/cClassTrib, then gIBSCBS) in the 2026-10-20 package.",
};
const ORDER_HINT = {
  cServ: "The 2026-10-20 package changed cServ's order: xDescServ now comes after cNBS and cIntContrib (cTribNac, cTribMun, cNBS, cIntContrib, xDescServ).",
};

function checkComplex(node, typeId, path, out, skipped) {
  const def = COMPLEX[typeId];
  if (!def) return;
  const label = node.name;
  const known = new Set(def.attrs.map((a) => a.n));
  for (const a of def.attrs) {
    const v = node.attrs[a.n];
    if (v === undefined) {
      if (a.req) out.push(finding("NFSE-003", `${label} is missing the required attribute ${a.n}.`, `Add ${a.n} (required by the national NFS-e schema).`, `${path}/@${a.n}`));
      continue;
    }
    const why = valueProblem(a.t, v);
    if (why) out.push(finding("NFSE-004", `${a.n} on ${label} ${why}.`, `Correct ${a.n} to a value the national NFS-e schema accepts.`, `${path}/@${a.n}`));
  }
  for (const k of Object.keys(node.attrs)) {
    if (k.includes(":") || known.has(k)) continue;
    out.push(finding("NFSE-003", `${label} carries an attribute the schema does not define: ${k}.`, `Remove ${k} or check its spelling.`, `${path}/@${k}`));
  }
  const kids = named(node.children);
  const unknown = kids.filter((c) => !def.kids[c.name] || (c.ns !== NFSE_NS && c.name !== "Signature"));
  for (const c of unknown) out.push(finding("NFSE-002", `${label} contains an element the national NFS-e schema does not allow there: ${c.name}.`, MOVED[`${label}/${c.name}`] || "Remove it or check its spelling and namespace (element names are case-sensitive).", `${path}/${c.name}`));
  if (!unknown.length) {
    const tokens = kids.map((c) => `<${c.name}>`).join("");
    if (!new RegExp(`^${def.model}$`).test(tokens)) {
      const have = new Set(kids.map((c) => c.name));
      const missing = (def.req || []).filter((n) => !have.has(n));
      const onlySignature = missing.length === 1 && missing[0] === "Signature";
      if (onlySignature && new RegExp(`^${def.model}$`).test(tokens + "<Signature>")) {
        skipped.push("signature: the NFS-e carries no ds:Signature; the national system signs every NFS-e it issues, and the signature itself is never checked here");
      } else if (missing.length && !onlySignature) {
        const newly = missing.map((n) => NEWLY_REQUIRED[n]).filter(Boolean);
        out.push(finding("NFSE-002", `${label} is missing the required element${missing.length > 1 ? "s" : ""} ${missing.join(", ")}.`, newly.length ? newly.join(" ") : "Add it (required by the national NFS-e schema).", `${path}/${missing[0]}`));
      } else out.push(finding("NFSE-002", `The elements inside ${label} are not in the order or number the national NFS-e schema allows (found ${kids.map((c) => c.name).join(", ") || "none"}; the schema's order is ${Object.keys(def.kids).join(", ")}, some of them alternatives).`, ORDER_HINT[label] || "Reorder or remove elements to fit the schema.", path));
    }
  }
  const seen = {};
  for (const c of kids) {
    const t = def.kids[c.name];
    if (!t || unknown.includes(c)) continue;
    seen[c.name] = (seen[c.name] || 0) + 1;
    const p = `${path}/${c.name}${seen[c.name] > 1 || REPEATED.has(c.name) ? `[${seen[c.name]}]` : ""}`;
    if (t.any) continue;
    if (t.c) { checkComplex(c, t.c, p, out, skipped); continue; }
    if (named(c.children).length) { out.push(finding("NFSE-002", `${c.name} should hold a value, not elements.`, "Check the file's structure.", p)); continue; }
    const why = valueProblem(t.s, c.text);
    if (why) out.push(finding("NFSE-004", `${c.name} "${c.text.length > 60 ? c.text.slice(0, 57) + "..." : c.text}" ${why}.`, `Correct ${c.name} to a value the national NFS-e schema accepts.`, p));
  }
}

// ---------- helpers ----------

const kid = (n, name) => n?.children.find((c) => c.name === name);
const txt = (n, name) => (kid(n, name)?.text ?? "").trim();
const descend = (n, ...names) => names.reduce((x, k) => kid(x, k), n);
const val = (n, ...names) => { const x = descend(n, ...names); return x ? (x.text ?? "").trim() : ""; };

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
// Rate in hundredths of a percent (2.00 -> 200) times a base in cents, rounded half up to
// cents: base x rate / 100.
const taxOf = (baseCents, rate) => Math.round((baseCents * units(rate, 2)) / 10000);

// ---------- identifiers ----------

function issuerId(infDPS) {
  const tpEmit = txt(infDPS, "tpEmit");
  const who = { 1: "prest", 2: "toma", 3: "interm" }[tpEmit] || "prest";
  const party = kid(infDPS, who);
  const cnpj = txt(party, "CNPJ"), cpf = txt(party, "CPF");
  return { who, cnpj, cpf, party };
}

function checkDpsId(infDPS, P, out) {
  const id = infDPS.attrs.Id || "";
  const m = /^DPS(\d{7})([12])([0-9A-Z]{14})(\d{5})(\d{15})$/.exec(id);
  if (!m) return; // the schema layer reports a malformed Id
  const [, mun, tp, insc, serie, num] = m;
  const fix = "Rebuild the Id as \"DPS\" + cLocEmi (7) + 1 for CPF or 2 for CNPJ + the issuer's CNPJ or CPF padded with zeros to 14 + serie padded to 5 + nDPS padded to 15 (the schema's TSIdDPS note).";
  const cLocEmi = txt(infDPS, "cLocEmi");
  if (cLocEmi && mun !== cLocEmi) out.push(finding("NFSE-010", `The DPS Id names municipality ${mun}, but cLocEmi is ${cLocEmi}.`, fix, `${P}/@Id`));
  const { who, cnpj, cpf } = issuerId(infDPS);
  const role = { prest: "provider (prest)", toma: "customer (toma)", interm: "intermediary (interm)" }[who];
  if (cnpj || cpf) {
    const wantTp = cnpj ? "2" : "1";
    const wantInsc = cnpj || cpf.padStart(14, "0");
    if (tp !== wantTp) out.push(finding("NFSE-010", `The DPS Id's inscription type is ${tp} (${tp === "1" ? "CPF" : "CNPJ"}), but the issuer, the ${role} named by tpEmit, has a ${cnpj ? "CNPJ" : "CPF"}.`, fix, `${P}/@Id`));
    else if (insc !== wantInsc) out.push(finding("NFSE-010", `The DPS Id carries inscription ${insc}, but the issuer, the ${role} named by tpEmit, is ${cnpj || cpf}.`, fix, `${P}/@Id`));
  }
  const s = txt(infDPS, "serie"), n = txt(infDPS, "nDPS");
  if (/^\d{1,5}$/.test(s) && Number(serie) !== Number(s)) out.push(finding("NFSE-010", `The DPS Id carries series ${serie}, but serie is ${s}.`, fix, `${P}/@Id`));
  if (/^\d{1,15}$/.test(n) && BigInt(num) !== BigInt(n)) out.push(finding("NFSE-010", `The DPS Id carries number ${num}, but nDPS is ${n}.`, fix, `${P}/@Id`));
}

function checkNfseKey(inf, infDPS, out, skipped) {
  const id = inf.attrs.Id || "";
  const m = /^NFS(\d{7})(\d)(\d)([0-9A-Z]{14})(\d{13})(\d{4})(\d{9})(\d)$/.exec(id);
  if (!m) return;
  const P = "/NFSe/infNFSe/@Id";
  const key = id.slice(3);
  if (/[A-Z]/.test(key)) skipped.push("access key check digit: the key carries an alphanumeric CNPJ, whose weighting in the NFS-e key was not read; the digit is not checked");
  else {
    const dv = keyCheckDigit(key.slice(0, 49));
    if (String(dv) !== key[49]) out.push(finding("NFSE-011", `The NFS-e access key ends in check digit ${key[49]}, but its first 49 digits give ${dv} (mod 11, weights 2 to 9 from the right, as in NF-e).`, "The national system computes the key: take the NFS-e again as it returned it, not a copy someone edited.", P));
  }
  const [, mun, amb, tp, insc, num, aamm] = m;
  const ambGer = txt(inf, "ambGer");
  if (ambGer && amb !== ambGer) out.push(finding("NFSE-012", `The access key's environment digit is ${amb}, but ambGer is ${ambGer}.`, "The key and ambGer must come from the same NFS-e.", P));
  const munOk = [txt(infDPS, "cLocEmi"), txt(inf, "cLocIncid"), val(infDPS, "serv", "locPrest", "cLocPrestacao")].filter(Boolean);
  if (munOk.length && !munOk.includes(mun)) out.push(finding("NFSE-012", `The access key names municipality ${mun}, which is none of the file's own (cLocEmi, cLocIncid, cLocPrestacao: ${[...new Set(munOk)].join(", ")}).`, "The key and the DPS must come from the same NFS-e.", P));
  const nNFSe = txt(inf, "nNFSe");
  if (/^\d{1,13}$/.test(nNFSe) && BigInt(num) !== BigInt(nNFSe)) out.push(finding("NFSE-012", `The access key carries number ${num}, but nNFSe is ${nNFSe}.`, "The key and nNFSe must come from the same NFS-e.", P));
  const { cnpj, cpf } = issuerId(infDPS);
  if (cnpj || cpf) {
    const want = cnpj || cpf.padStart(14, "0");
    if (tp !== (cnpj ? "2" : "1") || insc !== want) out.push(finding("NFSE-012", `The access key carries inscription ${tp === "1" ? "CPF" : "CNPJ"} ${insc}, but the DPS's issuer is ${cnpj ? "CNPJ" : "CPF"} ${cnpj || cpf}.`, "The key and the DPS must come from the same NFS-e.", P));
  }
  const months = [txt(inf, "dhProc"), txt(infDPS, "dhEmi")].filter((d) => /^\d{4}-\d{2}/.test(d)).map((d) => d.slice(2, 4) + d.slice(5, 7));
  if (months.length && !months.includes(aamm)) out.push(finding("NFSE-012", `The access key's year and month are ${aamm}, but the NFS-e was issued in ${[...new Set(months)].join(" / ")} (YYMM of dhEmi and dhProc).`, "The key and the dates must come from the same NFS-e.", P));
}

function checkIds(infDPS, P, inf, out) {
  const parties = [["prest", "provider's"], ["toma", "customer's"], ["interm", "intermediary's"]];
  if (inf) parties.push(["emit", "issuer's"]);
  for (const [where, label] of parties) {
    const node = where === "emit" ? kid(inf, "emit") : kid(infDPS, where);
    if (!node) continue;
    for (const k of ["CNPJ", "CPF"]) {
      const v = txt(node, k);
      if (!v) continue;
      const r = checkBrazilId(v);
      if (!r.ok && (r.kind === "cpf" || r.kind?.startsWith("cnpj"))) {
        out.push(finding("NFSE-013", `The ${label} ${k} ${v}: ${r.problems[0]}`, `Copy the ${k} from the party's registration (cartão CNPJ or CPF card).`, where === "emit" ? `/NFSe/infNFSe/emit/${k}` : `${P}/${where}/${k}`));
      }
    }
  }
}

// ---------- ISSQN sums ----------

// PIS/COFINS retention codes (TSTipoRetPISCofins) under which PIS or COFINS is retained.
const PIS_RET = { 1: [1, 1], 3: [1, 1], 4: [1, 1], 5: [1, 0], 6: [0, 1], 7: [0, 1] };

function checkIssqn(inf, infDPS, DP, out) {
  const vNFSe = kid(inf, "valores");
  const vDPS = kid(infDPS, "valores");
  if (!vNFSe || !vDPS) return null;
  const vServ = cents(val(vDPS, "vServPrest", "vServ"));
  const dInc = cents(val(vDPS, "vDescCondIncond", "vDescIncond"));
  const dCond = cents(val(vDPS, "vDescCondIncond", "vDescCond"));
  if (![vServ, dInc, dCond].every(Number.isFinite)) return null;
  const P = "/NFSe/infNFSe/valores";
  const tribMun = descend(vDPS, "trib", "tribMun");
  const vISSQN = val(vNFSe, "vISSQN");
  const vBC = val(vNFSe, "vBC");
  // NFSE-020: vBC = vServ - vDescIncond - (vAjusteBCISSQN + vCalcAjusteBCISSQN) - (vRedBCBM or vCalcBM).
  // The DPS states the adjustment and the benefit either in R$ or as a percentage; the NFS-e
  // carries the computed amount (vCalc...) for a percentage, so one of each pair is used.
  if (vBC) {
    const adj = val(vNFSe, "vCalcAjusteBCISSQN") || val(vDPS, "vAjusteBC", "vAjusteBCISSQN");
    const bm = val(vNFSe, "vCalcBM") || val(tribMun, "BM", "vRedBCBM");
    const want = vServ - dInc - cents(adj) - cents(bm);
    const have = cents(vBC);
    if (Number.isFinite(want) && Number.isFinite(have) && want !== have) out.push(finding("NFSE-020", `vBC (the ISSQN base) is ${vBC}, but vServ ${money(vServ)} - vDescIncond ${money(dInc)}${adj ? ` - adjustment ${adj}` : ""}${bm ? ` - municipal benefit ${bm}` : ""} = ${money(want)}.`, "Recompute the base as the schema's vBC note gives it, or correct the value or discount that is off.", `${P}/vBC`));
  }
  // NFSE-021: vISSQN = vBC x pAliqAplic (within a cent).
  const pAliq = val(vNFSe, "pAliqAplic");
  if (vBC && pAliq && vISSQN) {
    const want = taxOf(cents(vBC), pAliq);
    const have = cents(vISSQN);
    if (Number.isFinite(want) && Number.isFinite(have) && Math.abs(want - have) > 1) out.push(finding("NFSE-021", `vISSQN is ${vISSQN}, but vBC ${vBC} x pAliqAplic ${pAliq}% = ${money(want)}.`, "Recompute the ISSQN from the base and the rate applied.", `${P}/vISSQN`));
  }
  // NFSE-022/023: retentions and the net amount.
  const tribFed = descend(vDPS, "trib", "tribFed");
  const fed = ["vRetCP", "vRetIRRF", "vRetCSLL"].map((k) => cents(val(tribFed, k)));
  const tpRet = txt(tribMun, "tpRetISSQN");
  const issRet = tpRet === "2" || tpRet === "3" ? cents(vISSQN) : 0;
  const base = fed.reduce((a, b) => a + b, 0) + issRet;
  // The schema's vTotalRet note sums CP, IRRF, CSLL and ISSQN; where PIS or COFINS is
  // retained (tpRetPisCofins 1, 3-7) a total that also counts them is accepted too.
  const pc = kid(tribFed, "piscofins");
  const [rp, rc] = PIS_RET[txt(pc, "tpRetPisCofins")] || [0, 0];
  const withPc = base + (rp ? cents(txt(pc, "vPis")) : 0) + (rc ? cents(txt(pc, "vCofins")) : 0);
  const okRet = new Set([base, withPc]);
  const vTotalRet = val(vNFSe, "vTotalRet");
  if (!Number.isFinite(base) || !Number.isFinite(withPc)) return null;
  if (vTotalRet) {
    const have = cents(vTotalRet);
    if (Number.isFinite(have) && !okRet.has(have)) out.push(finding("NFSE-022", `vTotalRet is ${vTotalRet}, but the retentions add up to ${money(base)} (vRetCP + vRetIRRF + vRetCSLL${issRet ? " + ISSQN retained (tpRetISSQN " + tpRet + ")" : ""})${withPc !== base ? ` or ${money(withPc)} with the retained PIS/COFINS` : ""}.`, "Set vTotalRet to the sum of the retained amounts, or correct the retention that is off.", `${P}/vTotalRet`));
  }
  const vLiq = val(vNFSe, "vLiq");
  const rets = vTotalRet && Number.isFinite(cents(vTotalRet)) ? [cents(vTotalRet)] : [...okRet];
  const wants = rets.map((r) => vServ - dCond - dInc - r);
  if (vLiq && Number.isFinite(cents(vLiq)) && !wants.includes(cents(vLiq))) out.push(finding("NFSE-023", `vLiq is ${vLiq}, but vServ ${money(vServ)} - vDescCond ${money(dCond)} - vDescIncond ${money(dInc)} - retentions ${money(rets[0])} = ${money(wants[0])}.`, "Set vLiq to the service value less discounts and retained taxes (the schema's vLiq note).", `${P}/vLiq`));
  return { vServ, dInc, vISSQN: cents(vISSQN), vLiq: cents(vLiq), pis: cents(txt(pc, "vPis")), cofins: cents(txt(pc, "vCofins")) };
}

// ---------- IBS/CBS sums ----------

function checkReform(inf, infDPS, iss, out, skipped) {
  const g = kid(inf, "IBSCBS");
  if (!g || !iss) return;
  const P = "/NFSe/infNFSe/IBSCBS";
  const v = kid(g, "valores");
  const tot = kid(g, "totCIBS");
  const year = Number((txt(infDPS, "dCompet") || txt(infDPS, "dhEmi")).slice(0, 4));
  const vBC = val(v, "vBC");
  // NFSE-030: the base, by the schema's vBC note: to 2026 vServ - descIncond - adjustment
  // - vISSQN - vPIS - vCOFINS; 2027-2032 without PIS and COFINS.
  if (vBC && Number.isFinite(year)) {
    const adj = cents(val(v, "vCalcAjusteBCIBSCBS") || val(v, "vCalcAjusteBCLocImoveis"));
    const pc = year <= 2026 ? iss.pis + iss.cofins : 0;
    const want = iss.vServ - iss.dInc - adj - iss.vISSQN - pc;
    if (val(v, "vCalcReeRepRes") && cents(val(v, "vCalcReeRepRes")) !== 0) skipped.push("IBS/CBS base: vCalcReeRepRes (reimbursements and pass-throughs) is set, and the schema's vBC note does not say how it enters the base; the base is not checked");
    else if (Number.isFinite(want) && cents(vBC) !== want) out.push(finding("NFSE-030", `The IBS/CBS base vBC is ${vBC}, but vServ ${money(iss.vServ)} - vDescIncond ${money(iss.dInc)}${adj ? ` - adjustment ${money(adj)}` : ""} - vISSQN ${money(iss.vISSQN)}${year <= 2026 ? ` - vPIS ${money(iss.pis)} - vCOFINS ${money(iss.cofins)}` : ""} = ${money(want)} (the schema's note for ${year <= 2026 ? "up to 2026" : "2027 to 2032"}).`, "Recompute the IBS/CBS base as the schema's note gives it.", `${P}/valores/vBC`));
  }
  // NFSE-031: each tax at its effective rate; the effective rate is the stated rate when no
  // reduction applies.
  const pRedutor = val(g, "pRedutor");
  const rows = [
    ["uf", "pIBSUF", "pRedAliqUF", "pAliqEfetUF", ["gIBS", "gIBSUFTot", "vIBSUF"], "vIBSUF"],
    ["mun", "pIBSMun", "pRedAliqMun", "pAliqEfetMun", ["gIBS", "gIBSMunTot", "vIBSMun"], "vIBSMun"],
    ["fed", "pCBS", "pRedAliqCBS", "pAliqEfetCBS", ["gCBS", "vCBS"], "vCBS"],
  ];
  let reduced = false;
  for (const [grp, p, pRed, pEf, totPath, label] of rows) {
    const node = kid(v, grp);
    if (!node) continue;
    const rate = txt(node, p), ef = txt(node, pEf);
    if (txt(node, pRed) || pRedutor) reduced = true;
    else if (rate && ef && units(rate, 4) !== units(ef, 4)) out.push(finding("NFSE-031", `${pEf} is ${ef}%, but with no reduction (${pRed}, pRedutor) the effective rate is ${p} ${rate}%.`, `Set ${pEf} to ${rate}, or state the reduction.`, `${P}/valores/${grp}/${pEf}`));
    const amount = val(tot, ...totPath);
    if (vBC && ef && amount) {
      const want = taxOf(cents(vBC), ef);
      if (Number.isFinite(want) && Number.isFinite(cents(amount)) && Math.abs(want - cents(amount)) > 1) out.push(finding("NFSE-031", `${label} is ${amount}, but vBC ${vBC} x ${pEf} ${ef}% = ${money(want)}.`, `Recompute ${label} from the base and the effective rate.`, `${P}/totCIBS/${totPath.join("/")}`));
    }
  }
  if (reduced) skipped.push("IBS/CBS effective rates: a rate reduction (pRedAliq or pRedutor) is stated, and whether it is a fraction or a percentage was not read; the effective rates are taken as stated");
  // NFSE-032: vIBSTot = vIBSUF + vIBSMun.
  const gIBS = kid(tot, "gIBS");
  if (gIBS) {
    const t = val(gIBS, "vIBSTot"), u = val(gIBS, "gIBSUFTot", "vIBSUF"), mu = val(gIBS, "gIBSMunTot", "vIBSMun");
    if (t && u && mu && cents(t) !== cents(u) + cents(mu)) out.push(finding("NFSE-032", `vIBSTot is ${t}, but vIBSUF ${u} + vIBSMun ${mu} = ${money(cents(u) + cents(mu))}.`, "Set vIBSTot to the state plus the municipal IBS.", `${P}/totCIBS/gIBS/vIBSTot`));
  }
  // NFSE-033: vTotNF = vLiq in 2026; vLiq + vCBS + vIBSTot from 2027.
  const vTotNF = val(tot, "vTotNF");
  if (vTotNF && Number.isFinite(year) && Number.isFinite(iss.vLiq)) {
    const extra = year >= 2027 ? cents(val(gIBS, "vIBSTot")) + cents(val(tot, "gCBS", "vCBS")) : 0;
    const want = iss.vLiq + extra;
    if (Number.isFinite(want) && cents(vTotNF) !== want) out.push(finding("NFSE-033", `vTotNF is ${vTotNF}, but ${year >= 2027 ? `vLiq ${money(iss.vLiq)} + vCBS + vIBSTot` : `in ${year} it equals vLiq`} = ${money(want)} (the schema's vTotNF note).`, year >= 2027 ? "From 2027 IBS and CBS are charged on top: add them to vLiq." : "Until 2027 the IBS and CBS are informative: set vTotNF to vLiq.", `${P}/totCIBS/vTotNF`));
  }
}

// ---------- entry ----------

/** Check a national NFS-e DPS or NFSe file. Returns {findings, skipped, meta}. */
export function checkNfse(text) {
  const findings = [], skipped = [];
  let root;
  // A bare & (not an entity) is not well-formed XML; the reader here would let it pass.
  const body = String(text).replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, "");
  const amp = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.exec(body);
  if (amp) {
    const line = body.slice(0, amp.index).split("\n").length;
    return { findings: [finding("NFSE-001", `The file is not well-formed XML: a bare & near line ${line} ("${body.slice(Math.max(0, amp.index - 20), amp.index + 20).replace(/\s+/g, " ").trim()}").`, "Write & as &amp; (a company name such as \"A & B\" is the usual cause); the national system rejects a file that is not well-formed.", "/")], skipped, meta: {} };
  }
  try { root = parseCfdiXml(text).root; } catch (e) {
    return { findings: [finding("NFSE-001", `The file could not be read as XML: ${e.message}.`, "Export the DPS or NFS-e again from the issuing system (an unescaped & in a name is a common cause: it must be written &amp;).", "/")], skipped, meta: {} };
  }
  if (!root || !["DPS", "NFSe"].includes(root.name) || root.ns !== NFSE_NS) {
    return { findings: [finding("NFSE-001", `The root element is not DPS or NFSe in the namespace ${NFSE_NS}.`, "Check this is a national NFS-e (Padrão Nacional) file; municipal ABRASF layouts are not read.", "/")], skipped, meta: {} };
  }
  const isNfse = root.name === "NFSe";
  checkComplex(root, isNfse ? "TCNFSe" : "TCDPS", `/${root.name}`, findings, skipped);
  const inf = isNfse ? kid(root, "infNFSe") : null;
  const dps = isNfse ? kid(inf, "DPS") : root;
  const infDPS = kid(dps, "infDPS");
  const DP = isNfse ? "/NFSe/infNFSe/DPS/infDPS" : "/DPS/infDPS";
  const meta = {
    kind: root.name, versao: root.attrs.versao || "", tpAmb: txt(infDPS, "tpAmb"),
    ambGer: txt(inf, "ambGer"), cStat: txt(inf, "cStat"), key: (inf?.attrs.Id || "").slice(3), package: PACKAGE,
  };
  if (!infDPS) return { findings, skipped, meta };
  checkDpsId(infDPS, DP, findings);
  if (inf) checkNfseKey(inf, infDPS, findings, skipped);
  checkIds(infDPS, DP, inf, findings);
  if (inf) {
    const iss = checkIssqn(inf, infDPS, DP, findings);
    checkReform(inf, infDPS, iss, findings, skipped);
  } else skipped.push("sums: a DPS carries the values the national system computes from (vServ, discounts, rates); the totals (vBC, vISSQN, vLiq, IBS/CBS) appear only in the NFS-e it returns, so the sums are checked on an NFSe file");
  return { findings, skipped, meta };
}
