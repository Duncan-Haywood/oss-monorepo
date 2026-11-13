// Offline checks for a Brazilian municipal NFS-e in the ABRASF layout (the model most
// municipal web services follow, namespace http://www.abrasf.org.br/nfse.xsd): an RPS sent
// for conversion (GerarNfseEnvio, EnviarLoteRpsEnvio, EnviarLoteRpsSincronoEnvio), an issued
// NFS-e (CompNfse) or a web service's reply that carries them. Rule ids are ABR-nnn and are
// this tool's own; no municipal rejection code is named. Layers:
//   1. the schema (ABR-002..ABR-006) for layouts 2.00 to 2.04, read from the ABRASF XSDs
//      by build-abrasf-schema.mjs; a file that states another layout (1.00) or a provider's
//      own variant skips this layer and says so;
//   2. identifiers (ABR-010, ABR-011): CNPJ and CPF check digits (brazil.mjs); every IBGE
//      municipality code (CodigoMunicipio, MunicipioIncidencia, CodigoMunicipioGerador)
//      against IBGE's list of 5,571 codes, its check digit, and the state named beside it;
//   3. the values (ABR-020..ABR-023), the same in every 2.x layout and in 1.00:
//      BaseCalculo = ValorServicos - ValorDeducoes - DescontoIncondicionado;
//      ValorIss = BaseCalculo x Aliquota (a percentage, 5.00 for 5%; 1.00 files write the
//      fraction, 0.05, and both readings are accepted);
//      ValorLiquidoNfse = ValorServicos - PIS - COFINS - INSS - IR - CSLL - OutrasRetencoes
//      - ISS retained (IssRetido 1) - DescontoIncondicionado - DescontoCondicionado;
//      deductions plus the unconditional discount no more than ValorServicos.
//      The ABRASF manual itself was not reachable from the build host; the formulas are as
//      quoted from integration manuals that reproduce it (see README) and were then measured
//      on the real files described there, which is where the tolerance rules come from.
// An offline observation, not the municipality's acceptance, and not tax advice.

import { checkAgainstAbrasf, rootsOf, ABRASF_NS, VERSIONS, SOURCE } from "./abrasf-xsd.mjs";
import { checkBrazilId } from "./brazil.mjs";
import { parseCfdiXml } from "./cfdi-xml.mjs";
import { UF_CODE } from "./nfe.mjs";
import { GAPS, CHECK_DIGIT_EXCEPTIONS, COUNT } from "./ibge-municipios-data.mjs";

export { ABRASF_NS, SOURCE };
const finding = (rule, message, fix, path) => ({ rule, message, fix, path });

export function looksLikeAbrasf(text) {
  const head = String(text).slice(0, 8192);
  return head.includes("abrasf.org.br/nfse.xsd") || head.includes("abrasf.org.br/ABRASF/arquivos/nfse.xsd") || /&lt;[A-Za-z]+[^&]*xmlns=&quot;http:\/\/www\.abrasf\.org\.br\/nfse\.xsd/.test(head);
}

// ---------- IBGE municipality codes ----------

let MUNICIPIOS = null;
const municipios = () => {
  if (!MUNICIPIOS) { let c = 0; MUNICIPIOS = new Set(GAPS.split(",").map((g) => (c += parseInt(g, 36)))); }
  return MUNICIPIOS;
};
const UF_BY_CODE = Object.fromEntries(Object.entries(UF_CODE).map(([k, v]) => [v, k]));

export function ibgeCheckDigit(first6) {
  let s = 0;
  for (let i = 0; i < 6; i++) { const p = Number(first6[i]) * (i % 2 ? 2 : 1); s += Math.floor(p / 10) + (p % 10); }
  return (10 - (s % 10)) % 10;
}

/** Why `code` is not a municipality code IBGE lists, or "". */
export function municipioProblem(code) {
  const c = String(code).trim();
  if (c === "9999999") return ""; // ABRASF's code for a service abroad
  if (!/^\d{7}$/.test(c)) return "is not a 7-digit IBGE code";
  if (municipios().has(Number(c))) return "";
  if (!UF_BY_CODE[c.slice(0, 2)]) return `starts ${c.slice(0, 2)}, which is no state's IBGE code`;
  if (ibgeCheckDigit(c) !== Number(c[6]) && !CHECK_DIGIT_EXCEPTIONS.includes(Number(c))) return `ends in check digit ${c[6]}, but its first six digits give ${ibgeCheckDigit(c)} (a typo is likely)`;
  return `is not in IBGE's list of ${COUNT.toLocaleString("en")} municipality codes`;
}

// ---------- helpers ----------

const named = (n) => (n?.children || []).filter((c) => c.name);
const kid = (n, name) => named(n).find((c) => c.name === name);
const txt = (n, name) => (kid(n, name)?.text ?? "").trim();
function* walk(n, path) {
  yield [n, path];
  const seen = {};
  for (const c of named(n)) {
    const same = named(n).filter((k) => k.name === c.name).length;
    seen[c.name] = (seen[c.name] || 0) + 1;
    yield* walk(c, `${path}/${c.name}${same > 1 ? `[${seen[c.name]}]` : ""}`);
  }
}

function cents(s) {
  const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/.exec(String(s ?? ""));
  if (!m || (!m[2] && !m[3])) return NaN;
  const frac = (m[3] || "").padEnd(2, "0");
  const v = Number(m[2] || "0") * 100 + Number(frac.slice(0, 2)) + (Number(frac.slice(2) ? "0." + frac.slice(2) : 0) >= 0.5 ? 1 : 0);
  return m[1] === "-" ? -v : v;
}
const money = (c) => (c / 100).toFixed(2);
const amt = (n, name) => { const v = txt(n, name); return v === "" ? 0 : cents(v); };

// ---------- the file's ABRASF element ----------

// Many files wrap the ABRASF element: a SOAP envelope, a web service reply, an ERP's own
// container, or the XML escaped as text inside a SOAP parameter. Find the first element in
// the ABRASF namespace whose name a layout declares as a root, reading escaped XML once.
function findRoot(node, depth = 0) {
  const roots = new Set(VERSIONS.flatMap(rootsOf));
  for (const [n] of walk(node, "")) {
    if (n.ns === ABRASF_NS && roots.has(n.name)) return { root: n, wrapped: n !== node };
    if (depth === 0 && !named(n).length && /^\s*</.test(n.text || "") && n.text.includes("abrasf.org.br/nfse.xsd")) {
      try {
        const inner = findRoot(parseCfdiXml(n.text).root, 1);
        if (inner) return { ...inner, wrapped: true, escaped: true };
      } catch { /* not XML */ }
    }
  }
  return null;
}

function statedVersion(root) {
  for (const [n] of walk(root, "")) {
    if (n.attrs.versao) return n.attrs.versao.trim();
    if (n.name === "versaoDados") return n.text.trim();
  }
  return "";
}

// ---------- identifiers ----------

function checkIds(root, base, out) {
  for (const [n, p] of walk(root, base)) {
        if ((n.name === "Cnpj" || n.name === "Cpf") && !named(n).length && n.text.trim()) {
      const v = n.text.trim();
      const r = checkBrazilId(v);
      if (!r.ok && (r.kind === "cpf" || r.kind?.startsWith("cnpj"))) out.push(finding("ABR-010", `${n.name} ${v}: ${r.problems[0]}`, `Copy the ${n.name.toUpperCase()} from the party's registration (cartão CNPJ or CPF card).`, p));
    }
  }
  for (const [n, p] of walk(root, base)) {
        for (const field of ["CodigoMunicipio", "MunicipioIncidencia", "CodigoMunicipioGerador"]) {
      const c = kid(n, field);
      if (!c || named(c).length || !c.text.trim()) continue;
      const code = c.text.trim();
      const why = municipioProblem(code);
      if (why) { out.push(finding("ABR-011", `${field} ${code} ${why}.`, "Use the municipality's 7-digit IBGE code (the IBGE list, or the municipality's NFS-e manual).", `${p}/${field}`)); continue; }
      const uf = txt(n, "Uf");
      if (field === "CodigoMunicipio" && UF_CODE[uf] && code !== "9999999" && code.slice(0, 2) !== UF_CODE[uf]) out.push(finding("ABR-011", `CodigoMunicipio ${code} is in ${UF_BY_CODE[code.slice(0, 2)]} (IBGE state code ${code.slice(0, 2)}), but Uf beside it is ${uf} (code ${UF_CODE[uf]}).`, "Correct the city code or the state so they match.", `${p}/CodigoMunicipio`));
    }
  }
}

// ---------- values ----------

// Aliquota as a fraction of one: 5.00 (a percentage, layouts 2.x) or 0.05 (1.00). Values
// under 1 are ambiguous (0.50 could be 0.5% or 50%), so both readings are tried there.
function issCandidates(baseCents, aliq) {
  const a = Number(aliq);
  if (!Number.isFinite(a)) return [];
  const out = [Math.round((baseCents * a) / 100)];
  if (a < 1) out.push(Math.round(baseCents * a));
  return out;
}

// The InfDeclaracaoPrestacaoServico (2.x) or InfRps (1.00) that holds node `n`.
function declaracao(n, root) {
  let best = null;
  for (const [m] of walk(root, "")) if ((m.name === "InfDeclaracaoPrestacaoServico" || m.name === "InfRps") && [...walk(m, "")].some(([x]) => x === n)) best = m;
  return best;
}

function checkValues(root, base, out, notes) {
  for (const [n, p] of walk(root, base)) {
    if (n.name !== "Valores" || !kid(n, "ValorServicos")) continue;
    const servico = n; // Servico/Valores (2.x RPS and 1.00 alike)
    const vServ = amt(n, "ValorServicos");
    const ded = amt(n, "ValorDeducoes"), dInc = amt(n, "DescontoIncondicionado"), dCond = amt(n, "DescontoCondicionado");
    if (![vServ, ded, dInc, dCond].every(Number.isFinite)) continue;
    // The issued totals sit beside the values (1.00) or in InfNfse/ValoresNfse (2.x).
    let tot = kid(n, "BaseCalculo") || kid(n, "ValorLiquidoNfse") ? n : null;
    let totPath = p;
    if (!tot) {
      for (const [m, q] of walk(root, base)) {
        if (m.name === "InfNfse" && kid(m, "ValoresNfse") && [...walk(m, "")].some(([x]) => x === n)) { tot = kid(m, "ValoresNfse"); totPath = `${q}/ValoresNfse`; break; }
      }
    }
    // Servico carries IssRetido beside Valores in 2.x; 1.00 puts it inside Valores.
    let parent = null;
    for (const [m] of walk(root, base)) if (named(m).includes(n)) { parent = m; break; }
    const issRetido = (txt(parent, "IssRetido") || txt(n, "IssRetido")) === "1";

    if (ded + dInc > vServ) out.push(finding("ABR-023", `ValorDeducoes ${money(ded)} + DescontoIncondicionado ${money(dInc)} = ${money(ded + dInc)}, more than ValorServicos ${money(vServ)}.`, "Deductions and the unconditional discount cannot exceed the service value; check which amount is off.", `${p}/ValorServicos`));
    const wantBase = vServ - ded - dInc;
    const baseTxt = tot ? txt(tot, "BaseCalculo") : "";
    if (baseTxt && Number.isFinite(cents(baseTxt)) && cents(baseTxt) !== wantBase) out.push(finding("ABR-020", `BaseCalculo is ${baseTxt}, but ValorServicos ${money(vServ)} - ValorDeducoes ${money(ded)} - DescontoIncondicionado ${money(dInc)} = ${money(wantBase)}.`, "Recompute the ISS base from the service value, the deductions and the unconditional discount (a conditional discount does not lower it).", `${totPath}/BaseCalculo`));
    const baseC = baseTxt && Number.isFinite(cents(baseTxt)) ? cents(baseTxt) : wantBase;
    // ValorIss: the issued total if there is one, else the RPS's own.
    for (const [node, where] of [[tot, totPath], [tot === servico ? null : servico, p]]) {
      if (!node) continue;
      const iss = txt(node, "ValorIss"), aliq = txt(node, "Aliquota") || txt(tot, "Aliquota") || txt(servico, "Aliquota");
      if (!iss || !aliq || !Number.isFinite(cents(iss))) continue;
      if (cents(iss) === 0 && cents(aliq) !== 0) {
        // A zero ISS beside a rate: an RPS that leaves the computation to the municipality,
        // a Simples Nacional provider (ISS paid inside the DAS) or ISS not due here.
        const sn = txt(declaracao(n, root), "OptanteSimplesNacional") === "1";
        const exig = txt(parent, "ExigibilidadeISS");
        if (node === servico || sn || (exig && exig !== "1")) { notes.add(`ValorIss: 0.00 beside Aliquota ${aliq}${sn ? " from a Simples Nacional provider" : exig && exig !== "1" ? ` with ExigibilidadeISS ${exig}` : " on an RPS"}; read as not computed by the issuer, not checked`); continue; }
      }
      // The issued ISS may follow the stated base or the computed one (a wrong base is
      // reported once, by ABR-020); an RPS has no stated base, so the computed one is used.
      const want = node === servico && node !== tot ? issCandidates(wantBase, aliq) : [...issCandidates(baseC, aliq), ...issCandidates(wantBase, aliq)];
      if (want.length && !want.some((w) => Math.abs(w - cents(iss)) <= 1)) out.push(finding("ABR-021", `ValorIss is ${iss}, but BaseCalculo ${money(node === servico && node !== tot ? wantBase : baseC)} x Aliquota ${aliq}% = ${money(want[0])}.`, "Recompute the ISS from the base and the rate (Aliquota is a percentage in layouts 2.x: 5.00 for 5%).", `${where}/ValorIss`));
    }
    const liqTxt = tot ? txt(tot, "ValorLiquidoNfse") : txt(n, "ValorLiquidoNfse");
    if (liqTxt && Number.isFinite(cents(liqTxt))) {
      const fed = ["ValorPis", "ValorCofins", "ValorInss", "ValorIr", "ValorCsll", "OutrasRetencoes"].map((k) => amt(n, k));
      const issVal = cents(txt(tot, "ValorIss") || txt(n, "ValorIss") || "0");
      const issRet = issRetido ? (Number.isFinite(cents(txt(n, "ValorIssRetido"))) && txt(n, "ValorIssRetido") ? cents(txt(n, "ValorIssRetido")) : issVal) : 0;
      const want = vServ - fed.reduce((a, b) => a + b, 0) - issRet - dInc - dCond;
      if (Number.isFinite(want) && Math.abs(want - cents(liqTxt)) > 1) out.push(finding("ABR-022", `ValorLiquidoNfse is ${liqTxt}, but ValorServicos ${money(vServ)} - PIS/COFINS/INSS/IR/CSLL/other retentions ${money(fed.reduce((a, b) => a + b, 0))}${issRetido ? ` - ISS retained ${money(issRet)}` : ""} - DescontoIncondicionado ${money(dInc)} - DescontoCondicionado ${money(dCond)} = ${money(want)}.`, issRetido ? "The net amount deducts the retained ISS (IssRetido 1) and every federal retention." : "The net amount deducts the federal retentions and both discounts; ISS is deducted only when retained (IssRetido 1).", `${tot ? totPath : p}/ValorLiquidoNfse`));
    }
  }
}

// ---------- entry ----------

/** Check an ABRASF NFS-e file. Returns {findings, skipped, meta}. */
export function checkAbrasf(text) {
  const findings = [], skipped = [];
  const body = String(text).replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, "");
  const amp = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.exec(body);
  if (amp) {
    const line = body.slice(0, amp.index).split("\n").length;
    return { findings: [finding("ABR-001", `The file is not well-formed XML: a bare & near line ${line}.`, "Write & as &amp; (a company name such as \"A & B\" is the usual cause); the web service rejects a file that is not well-formed.", "/")], skipped, meta: {} };
  }
  let doc;
  try { doc = parseCfdiXml(text).root; } catch (e) {
    return { findings: [finding("ABR-001", `The file could not be read as XML: ${e.message}.`, "Export the RPS or NFS-e again from the issuing system.", "/")], skipped, meta: {} };
  }
  let found = doc && findRoot(doc);
  if (!found && doc) {
    // A declared root outside the namespace (a dropped or mistyped xmlns): name it, then
    // check identifiers and values anyway. Failing that, an older layout (1.00, InfRps) or a
    // provider variant: the first ABRASF-namespace element, values only.
    const roots = new Set(VERSIONS.flatMap(rootsOf));
    const all = [...walk(doc, "")].map(([n]) => n);
    const misplaced = all.find((n) => roots.has(n.name));
    if (misplaced) {
      findings.push(finding("ABR-002", `${misplaced.name} is not in the ABRASF namespace (it is in ${misplaced.ns ? `"${misplaced.ns}"` : "no namespace"}), so the web service cannot read it as ${misplaced.name}.`, `Declare xmlns="${ABRASF_NS}" on ${misplaced.name} (exactly that address; a missing slash or a namespace set only on an inner element is the usual cause).`, `/${misplaced.name}`));
      found = { root: misplaced, wrapped: misplaced !== doc, offNs: true };
    } else {
      const first = all.find((n) => n.ns === ABRASF_NS || /abrasf\.org\.br/.test(n.ns));
      if (first) found = { root: first, wrapped: first !== doc, other: true };
    }
  }
  if (!found) {
    return { findings: [finding("ABR-001", `No ABRASF element (GerarNfseEnvio, EnviarLoteRpsEnvio, CompNfse, ...) was found.`, "Check this is an ABRASF-layout municipal NFS-e; providers with their own layouts (São Paulo's Paulistana, DSF, Betha 1.0, ...) are not read, and the national NFS-e has its own check.", "/")], skipped, meta: {} };
  }
  const { root, wrapped, escaped, offNs, other } = found;
  const base = `/${root.name}`;
  const stated = statedVersion(root);
  let version = "";
  if (offNs) skipped.push(`schema: ${root.name} is outside the ABRASF namespace, so the schema layer is skipped (identifiers and values are still checked)`);
  else if (other) skipped.push(`schema: ${root.name} is not an element ABRASF 2.00-2.04 declares as a document (an older layout such as 1.00, a provider's variant, or a fragment), so the schema layer is skipped (identifiers and values are still checked)`);
  else if (VERSIONS.includes(stated)) version = stated;
  else if (!stated) {
    // No layout stated: take the layout under which the file draws fewer schema findings.
    const tries = VERSIONS.map((v) => [v, checkAgainstAbrasf(root, v)]).sort((a, b) => a[1].length - b[1].length || (a[0] < b[0] ? 1 : -1));
    version = tries[0][0];
    skipped.push(`layout: the file states none (no versao); checked against ABRASF ${version}, the layout it fits best`);
  } else skipped.push(`schema: the file states layout ${stated}; only ABRASF 2.00 to 2.04 are read, so the schema layer is skipped (identifiers and values are still checked)`);
  if (version) {
    const own = checkAgainstAbrasf(root, version);
    findings.push(...own);
    // A stale or copied versao: the file draws schema findings under the layout it states
    // but none, or far fewer, under another (2.00 writes DataEmissao as a date and time,
    // 2.01 on as a date; 2.04 renamed Tomador to TomadorServico). Say which layout it fits;
    // the findings stand.
    if (stated && own.length) {
      const best = VERSIONS.filter((v) => v !== version).map((v) => [v, checkAgainstAbrasf(root, v).length]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? 1 : -1))[0];
      if (best && (best[1] === 0 || best[1] * 2 <= own.length - 2)) skipped.push(`layout: the file states ${version} and draws ${own.length} schema finding${own.length === 1 ? "" : "s"} under it, but ${best[1] === 0 ? "none" : best[1]} under ABRASF ${best[0]}: if the city's web service runs ${best[0]}, set versao to ${best[0]} (or build the file to ${version})`);
    }
  }
  checkIds(root, base, findings);
  const notes = new Set();
  checkValues(root, base, findings, notes);
  skipped.push(...notes);
  if (wrapped) skipped.push(`wrapper: the ABRASF element ${root.name} sits inside ${escaped ? "escaped text (a SOAP parameter)" : `${doc.name}`}; only ${root.name} is checked`);
  if ([...walk(root, "")].some(([n]) => n.name === "Signature")) skipped.push("signature: ds:Signature is present and not verified here");
  const kinds = new Set([...walk(root, "")].map(([n]) => n.name));
  const meta = { root: root.name, version: version || stated, stated, issued: kinds.has("InfNfse"), rps: kinds.has("InfDeclaracaoPrestacaoServico") || kinds.has("InfRps"), source: SOURCE };
  return { findings, skipped, meta };
}
