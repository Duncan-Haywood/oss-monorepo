// Brazil's municipal NFS-e in DSF's own layout ("ISSDSF", the WsNFe2 web service): the
// system Campinas, Sorocaba, Belém, Campo Grande, Teresina, Uberlândia and other cities run.
// It is not an ABRASF model: an RPS batch (ReqEnvioLoteRPS) carries a header with the batch
// totals, and every RPS carries an Assinatura, the SHA-1 of a fixed-width string built from
// its own fields, which the city's server recomputes. The XSDs (1.00 and 1.01, 1.01 adds
// CodigoServico) are read by build-abrasf-schema.mjs from OpenAC.Net.NFSe, MIT.
//   DSF-001 not XML, or no DSF message found
//   DSF-002..006 schema (as ABR-002..006: element not allowed / out of order / missing /
//                bad value / attribute)
//   DSF-010 an RPS's Assinatura is not the SHA-1 of its fields
//   DSF-011 QtdRPS is not the number of RPS in the batch
//   DSF-012 ValorTotalServicos is not the batch's services less deductions
//   DSF-013 ValorTotalDeducoes is not the sum of the RPS deductions
//   DSF-014 an RPS dated outside the header's dtInicio..dtFim
//   DSF-015 an item's ValorTotal is not Quantidade x ValorUnitario
//   DSF-020 a city code that is not a TOM (SIAFI) code, or an IBGE code where TOM is wanted
//   DSF-021 a CPF or CNPJ with wrong check digits
//   DSF-022 a buyer abroad (CidadeTomador 0009999) without DocTomadorEstrangeiro
// The Assinatura formula (README, "DSF"): InscricaoMunicipalPrestador zero-filled to 11,
// SerieRPS space-filled on the right to 5, NumeroRPS zero-filled to 12, DataEmissaoRPS as
// yyyyMMdd, Tributacao space-filled to 2, SituacaoRPS, "S" if TipoRecolhimento is R (ISS
// retained) else "N", the services less deductions in cents zero-filled to 15, the deductions
// in cents zero-filled to 15, CodigoAtividade zero-filled to 10, CPFCNPJTomador zero-filled
// to 14; SHA-1, lower-case hex. Measured on 55 signed RPS in 21 public files: 49 reproduce,
// the other 6 are placeholders or edited copies (eval/dsf-2026-11-13.md).
import { parseCfdiXml } from "./cfdi-xml.mjs";
import { checkAgainstAbrasf, rootsOf, rootNamespace, cityProvider, CITY_COUNT, SOURCE } from "./abrasf-xsd.mjs";
import { checkBrazilId } from "./brazil.mjs";
import { sha1Hex } from "./sha1.mjs";
import TOM_ROWS, { SOURCE as TOM_SOURCE } from "./tom-data.mjs";

export const DSF_NS = "http://localhost:8080/WsNFe2/lote";
export const DSF_LAYOUTS = ["ISSDSF 1.00", "ISSDSF 1.01"];
const finding = (rule, message, fix, path) => ({ rule, message, fix, path });

export function looksLikeDsf(text) {
  return String(text).slice(0, 8192).includes("localhost:8080/WsNFe2/lote");
}

// ---------- TOM (SIAFI) city codes ----------

let TOM = null;
function tom() {
  if (TOM) return TOM;
  const byTom = new Map(), byIbge = new Map();
  for (const row of TOM_ROWS.split("\n")) {
    const [ibge, t, name] = row.split("\t");
    byTom.set(t, { ibge, name });
    byIbge.set(ibge, { tom: t, name });
  }
  return (TOM = { byTom, byIbge });
}
/** { ibge, name } for a TOM code (leading zeros ignored), or null. */
export function tomCity(code) {
  const c = String(code).trim().replace(/^0+(?=\d{4}$)/, "");
  return /^\d{4}$/.test(c) ? tom().byTom.get(c) ?? null : null;
}
/** Why `code` is not a TOM city code, or "". Names the TOM code when an IBGE code was written. */
function tomProblem(code) {
  const c = String(code).trim();
  if (!/^\d+$/.test(c)) return { why: "is not a number" };
  if (tomCity(c)) return null;
  const asIbge = tom().byIbge.get(c.replace(/^0+(?=\d{7}$)/, ""));
  if (asIbge) return { why: `is the IBGE code of ${asIbge.name}; DSF's layout takes the city's TOM (SIAFI) code, ${asIbge.tom}`, want: asIbge.tom };
  return { why: "is not a TOM (SIAFI) code in the national table" };
}

// ---------- helpers ----------

const named = (n) => (n?.children || []).filter((c) => c.name);
const kid = (n, name) => named(n).find((c) => c.name === name);
const kids = (n, name) => named(n).filter((c) => c.name === name);
const txt = (n, name) => (kid(n, name)?.text ?? "").trim();
function cents(s) {
  const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/.exec(String(s ?? ""));
  if (!m || (!m[2] && !m[3])) return NaN;
  const frac = (m[3] || "").padEnd(3, "0");
  const v = Number(m[2] || "0") * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
  return m[1] === "-" ? -v : v;
}
const money = (c) => (c / 100).toFixed(2);
const digits = (s, n) => String(s).replace(/\D/g, "").padStart(n, "0").slice(-n);

/** The services, deductions and signature string of one RPS element. */
export function rpsSums(rps) {
  const services = kids(kid(rps, "Itens"), "Item").reduce((a, it) => a + (cents(txt(it, "ValorTotal")) || 0), 0);
  let deductions = 0;
  for (const d of kids(kid(rps, "Deducoes"), "Deducao")) {
    const value = cents(txt(d, "ValorDeduzir")) || 0;
    // A percentage deduction may leave ValorDeduzir at 0.00: DSF's own sample (EnvioAssinado02,
    // RPS 2, 10% of 180.00) signs and totals it as 18.00.
    const pct = Number(txt(d, "PercentualDeduzir"));
    deductions += txt(d, "DeducaoPor") === "Percentual" && !value && pct > 0 ? Math.round((services * pct) / 100) : value;
  }
  return { services, deductions };
}
export function signatureString(rps) {
  const { services, deductions } = rpsSums(rps);
  const z15 = (c) => String(Math.max(0, c)).padStart(15, "0");
  return digits(txt(rps, "InscricaoMunicipalPrestador"), 11) + txt(rps, "SerieRPS").padEnd(5, " ").slice(0, 5) + digits(txt(rps, "NumeroRPS"), 12) +
    txt(rps, "DataEmissaoRPS").slice(0, 10).replace(/-/g, "") + txt(rps, "Tributacao").padEnd(2, " ").slice(0, 2) + txt(rps, "SituacaoRPS") +
    (txt(rps, "TipoRecolhimento") === "R" ? "S" : "N") + z15(services - deductions) + z15(deductions) +
    digits(txt(rps, "CodigoAtividade"), 10) + digits(txt(rps, "CPFCNPJTomador"), 14);
}

// ---------- the check ----------

const SCHEMA_MAP = { "ABR-002": "DSF-002", "ABR-003": "DSF-003", "ABR-004": "DSF-004", "ABR-005": "DSF-005", "ABR-006": "DSF-006" };

function findRoot(doc) {
  const roots = new Set(rootsOf(DSF_LAYOUTS[0]));
  const stack = [doc];
  while (stack.length) {
    const n = stack.shift();
    if (roots.has(n.name) && n.ns === rootNamespace(DSF_LAYOUTS[0], n.name)) return n;
    stack.push(...named(n));
  }
  return null;
}

export function checkDsf(text) {
  const findings = [], skipped = [];
  let doc;
  try { doc = parseCfdiXml(text).root; } catch (e) {
    return { findings: [finding("DSF-001", `The file could not be read as XML: ${e.message}.`, "Export the RPS batch again from the issuing system.", "/")], skipped, meta: {} };
  }
  const root = doc && findRoot(doc);
  if (!root) return { findings: [finding("DSF-001", `No DSF message (ReqEnvioLoteRPS, ReqCancelamentoNFSe, ReqConsultaLote, ...) in ${DSF_NS} was found.`, `Check the root element and its namespace: DSF's layout puts the message in ${DSF_NS} (the address as DSF publishes it) and every element below it in no namespace.`, "/")], skipped, meta: {} };
  const base = `/${root.name}`;
  // 1.01 differs from 1.00 only by CodigoServico in the RPS; the Cabecalho's Versao says which.
  const head = kid(root, "Cabecalho");
  const stated = txt(head, "Versao");
  const hasCodigoServico = kids(kid(root, "Lote"), "RPS").some((r) => kid(r, "CodigoServico"));
  const layout = hasCodigoServico ? "ISSDSF 1.01" : "ISSDSF 1.00";
  const schema = checkAgainstAbrasf(root, layout);
  for (const f of schema) findings.push({ ...f, rule: Object.hasOwn(SCHEMA_MAP, f.rule) ? SCHEMA_MAP[f.rule] : f.rule, message: f.message.replace(/the ABRASF schema/g, "DSF's schema") });
  skipped.push(`layout: ${root.name} checked against DSF ${layout.split(" ")[1]} (13 schema files read from OpenAC.Net.NFSe)${hasCodigoServico ? ", the layout with CodigoServico" : ""}${stated ? `; the header states Versao ${stated}` : ""}`);

  // The city: CodCidade (a TOM code) in the header.
  const cod = txt(head, "CodCidade");
  if (cod) {
    const p = tomProblem(cod);
    if (p) findings.push(finding("DSF-020", `CodCidade ${cod} ${p.why}.`, p.want ? `Write <CodCidade>${p.want}</CodCidade>.` : "Use the city's four-digit TOM (SIAFI) code; the web service routes the batch by it.", `${base}/Cabecalho/CodCidade`));
    else {
      const c = tomCity(cod);
      const run = cityProvider(c.ibge);
      if (run && !/^ISSDSF/i.test(run.listed)) skipped.push(`city: CodCidade ${cod} is ${c.name} (IBGE ${c.ibge}), which runs ${run.listed} per OpenAC.Net.NFSe's list of ${CITY_COUNT} cities, not DSF's system: check which web service the city takes`);
      else skipped.push(`city: CodCidade ${cod} is ${c.name} (IBGE ${c.ibge})${run ? `, listed on ${run.listed} by OpenAC.Net.NFSe` : ""}`);
    }
  }
  const remetente = txt(head, "CPFCNPJRemetente");
  if (remetente) {
    const id = checkBrazilId(remetente);
    if (!id.ok) findings.push(finding("DSF-021", `CPFCNPJRemetente ${remetente}: ${id.problems[0]}`, "Correct the sender's CPF or CNPJ.", `${base}/Cabecalho/CPFCNPJRemetente`));
  }

  const rpsList = kids(kid(root, "Lote"), "RPS");
  if (root.name === "ReqEnvioLoteRPS" && head) {
    let services = 0, deductions = 0, first = "", last = "";
    const seen = new Map();
    rpsList.forEach((rps, i) => {
      const p = `${base}/Lote/RPS${rpsList.length > 1 ? `[${i + 1}]` : ""}`;
      const s = rpsSums(rps);
      services += s.services; deductions += s.deductions;
      const date = txt(rps, "DataEmissaoRPS").slice(0, 10);
      if (date) { if (!first || date < first) first = date; if (!last || date > last) last = date; }
      const sig = txt(rps, "Assinatura");
      if (sig) {
        const plain = signatureString(rps);
        const want = sha1Hex(plain);
        if (sig.toLowerCase() !== want) findings.push(finding("DSF-010", `RPS ${txt(rps, "SerieRPS")} ${txt(rps, "NumeroRPS")}: Assinatura is ${sig.length > 48 ? `${sig.slice(0, 40)}...` : sig}, but the SHA-1 of its fields is ${want} (from "${plain.replace(/ /g, "␣")}", ␣ a space).`, "Rebuild the Assinatura from the RPS as sent: IM (11) + series (5, spaces right) + number (12) + date yyyyMMdd + Tributacao (2) + SituacaoRPS + S/N retained + services less deductions (15, cents) + deductions (15, cents) + CodigoAtividade (10) + buyer's CPF/CNPJ (14). A value edited after signing is the usual cause.", `${p}/Assinatura`));
        else if (sig !== want) skipped.push(`signature: RPS ${txt(rps, "NumeroRPS")}'s Assinatura matches in upper case; DSF's samples write it in lower case`);
      }
      const key = `${txt(rps, "SerieRPS")}|${txt(rps, "NumeroRPS")}`;
      if (seen.has(key)) skipped.push(`duplicate: RPS ${txt(rps, "SerieRPS")} ${txt(rps, "NumeroRPS")} appears ${seen.get(key) + 1} times in the batch; an RPS number identifies one RPS, so check the batch before sending`);
      seen.set(key, (seen.get(key) ?? 0) + 1);
      kids(kid(rps, "Itens"), "Item").forEach((it, j) => {
        const q = Number(txt(it, "Quantidade")), u = cents(txt(it, "ValorUnitario")), t = cents(txt(it, "ValorTotal"));
        if (Number.isFinite(q) && Number.isFinite(u) && Number.isFinite(t) && txt(it, "Quantidade") !== "" && Math.abs(Math.round(q * u) - t) > 1)
          findings.push(finding("DSF-015", `RPS ${txt(rps, "NumeroRPS")}, item ${j + 1}: ValorTotal is ${money(t)}, but Quantidade ${txt(it, "Quantidade")} x ValorUnitario ${money(u)} = ${money(Math.round(q * u))}.`, "Make the item's total its quantity times its unit price; the RPS's services value is the sum of the item totals.", `${p}/Itens/Item${j ? `[${j + 1}]` : ""}/ValorTotal`));
      });
      // CidadeTomador 0009999 marks a buyer abroad (the schema's note on DocTomadorEstrangeiro,
      // which is then required); DSF's own sample writes CPFCNPJTomador 77777777777 for one.
      const abroad = /^0*9999$/.test(txt(rps, "CidadeTomador"));
      if (abroad && !txt(rps, "DocTomadorEstrangeiro")) findings.push(finding("DSF-022", `RPS ${txt(rps, "NumeroRPS")}: CidadeTomador ${txt(rps, "CidadeTomador")} marks a buyer abroad, but DocTomadorEstrangeiro is ${kid(rps, "DocTomadorEstrangeiro") ? "empty" : "missing"}.`, "Give the foreign buyer's identity document in DocTomadorEstrangeiro (up to 20 characters); DSF's schema notes it is required whenever CidadeTomador is 0009999.", `${p}/DocTomadorEstrangeiro`));
      if (abroad) skipped.push(`abroad: RPS ${txt(rps, "NumeroRPS")}'s buyer is abroad (CidadeTomador ${txt(rps, "CidadeTomador")}), so CPFCNPJTomador ${txt(rps, "CPFCNPJTomador") || "(empty)"} is not checked as a Brazilian CPF or CNPJ`);
      for (const [name, label] of [["CPFCNPJTomador", "buyer"], ["CPFCNPJIntermediario", "intermediary"]]) {
        const v = txt(rps, name);
        if (abroad && name === "CPFCNPJTomador") continue;
        // An empty value or all zeros is how DSF's samples write "not identified".
        if (!v || /^0+$/.test(v)) continue;
        const id = checkBrazilId(v);
        if (!id.ok) findings.push(finding("DSF-021", `RPS ${txt(rps, "NumeroRPS")}: ${name} ${v}: ${id.problems[0]}`, `Correct the ${label}'s CPF or CNPJ; it is part of the Assinatura too.`, `${p}/${name}`));
      }
      for (const name of ["CidadeTomador", "MunicipioPrestacao"]) {
        const v = txt(rps, name);
        if (!v || /^0+$/.test(v) || (name === "CidadeTomador" && abroad)) continue;
        const pr = tomProblem(v);
        if (pr) findings.push(finding("DSF-020", `RPS ${txt(rps, "NumeroRPS")}: ${name} ${v} ${pr.why}.`, pr.want ? `Write <${name}>${pr.want.padStart(7, "0")}</${name}> (DSF's samples zero-fill the TOM code to 7 digits).` : "Use the city's TOM (SIAFI) code.", `${p}/${name}`));
      }
    });
    const qtd = txt(head, "QtdRPS");
    if (qtd !== "" && Number(qtd) !== rpsList.length) findings.push(finding("DSF-011", `QtdRPS is ${qtd}, but the batch holds ${rpsList.length} RPS.`, `Write <QtdRPS>${rpsList.length}</QtdRPS>.`, `${base}/Cabecalho/QtdRPS`));
    const vts = cents(txt(head, "ValorTotalServicos"));
    const net = services - deductions;
    if (Number.isFinite(vts) && rpsList.length && vts !== net) {
      const gross = vts === services && deductions;
      findings.push(finding("DSF-012", `ValorTotalServicos is ${money(vts)}, but the RPS add up to ${money(services)} of services less ${money(deductions)} of deductions = ${money(net)}${gross ? ": the header holds the gross" : ""}.`, `Write <ValorTotalServicos>${money(net)}</ValorTotalServicos>. DSF's own sample batches with deductions (three of them) put the services less deductions here${gross ? "; some libraries write the gross, so if the city's server has accepted gross totals from you before, it does not check this" : ""}.`, `${base}/Cabecalho/ValorTotalServicos`));
    }
    const vtd = cents(txt(head, "ValorTotalDeducoes"));
    if (Number.isFinite(vtd) && rpsList.length && vtd !== deductions) findings.push(finding("DSF-013", `ValorTotalDeducoes is ${money(vtd)}, but the RPS deductions add up to ${money(deductions)}.`, `Write <ValorTotalDeducoes>${money(deductions)}</ValorTotalDeducoes>.`, `${base}/Cabecalho/ValorTotalDeducoes`));
    const ini = txt(head, "dtInicio"), fim = txt(head, "dtFim");
    if (first && ini && /^\d{4}-\d{2}-\d{2}$/.test(ini) && first < ini) findings.push(finding("DSF-014", `An RPS is dated ${first}, before the header's dtInicio ${ini}.`, `Set dtInicio to the earliest RPS date, ${first}.`, `${base}/Cabecalho/dtInicio`));
    if (last && fim && /^\d{4}-\d{2}-\d{2}$/.test(fim) && last > fim) findings.push(finding("DSF-014", `An RPS is dated ${last}, after the header's dtFim ${fim}.`, `Set dtFim to the latest RPS date, ${last}.`, `${base}/Cabecalho/dtFim`));
  }
  if (kid(root, "Signature")) skipped.push("signature: the batch's ds:Signature is present and not verified here (each RPS's Assinatura is)");
  return { findings, skipped, meta: { root: root.name, version: layout, stated, rps: rpsList.length, source: `${SOURCE}; ${TOM_SOURCE}` } };
}
