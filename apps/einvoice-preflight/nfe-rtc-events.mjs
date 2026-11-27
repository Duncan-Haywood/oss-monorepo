// Offline checks for the other events of Brazil's IBS/CBS reform (NT 2025.002-RTC section 8)
// besides the presumed-credit event 211110 (nfe-event.mjs), and the generic cancellation
// 110001 that undoes any of them. nfe-event.mjs reads the envelope (Id, key, author, date)
// for every event and calls checkRtcDetEvento() for the detEvento of these types.
//
// Sources, read 2026-11-14 (the Portal da NF-e and SVRS refused the build host):
//   * each event's e<tpEvento>_v1.00.xsd and tiposBasico_v1.03.xsd from the NT 2025.002 v1.40
//     events package (published 2026-07-27), as mirrored with its portal URL in
//     stackin-io/data-source data/nfe/esquemas-xml/ (SHA-256 of each file below). Only the
//     facts of each layout are restated (element names, order, counts, enumerations and
//     patterns; schemas are official acts, Lei 9.610/1998 art. 8, IV);
//   * NT 2025.002 v1.51 sections 8.1-8.18 as transcribed at
//     higajooj/dfe_law_reference@7871ab40116f src/nfe/nt2025-002/08-eventos/: the authors,
//     and the business rules of 8.6.3 (211130), 8.7.3 (211140), 8.8.3 (211150) and 8.13.3
//     (110001); the general event rules from the same repository's MOC 5.8.4 transcription.
//
// 112120 (ALC/ZFM import not converted into exemption, section 8.14) is in the same package,
// under the file name "e112120_v1.00 .xsd" (a space before the extension, as published). 211120
// ("Destinação de item para consumo pessoal", in the v1.30 package of 2025-10-07) was removed
// by NT 2025.002 v1.40 (change history: "Eliminação do Evento 211120"), though 110001's
// tpEventoAut still lists it; an event of that type is reported, not checked.
//
// An offline observation, not SEFAZ's answer, and not tax advice.

const T = {
  TDec_1302: /^(?:0|0\.[0-9]{2}|[1-9][0-9]{0,12}(?:\.[0-9]{2})?)$/,
  TDec_1104: /^(?:0|0\.[0-9]{4}|[1-9][0-9]{0,10}(?:\.[0-9]{4})?)$/,
  TnItem: /^(?:[1-9][0-9]?|[1-8][0-9]{2}|9[0-8][0-9]|990)$/,
  TProt: /^(?:[0-9]{15}|[0-9]{17})$/,
  TData: /^(?:20(?:[02468][048]|[13579][26])-02-29|20[0-9]{2}-(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1[0-9]|2[0-8])|(?:0[13578]|1[02])-31|(?:0[13-9]|1[0-2])-(?:29|30)))$/,
};
// TString: no space at either end, characters U+0020 to U+00FF.
const TSTRING = /^[!-ÿ](?:[ -ÿ]*[!-ÿ])?$/u;
const UFS = new Set(["11", "12", "13", "14", "15", "16", "17", "21", "22", "23", "24", "25", "26", "27", "28", "29", "31", "32", "33", "35", "41", "42", "43", "50", "51", "52", "53"]);

const TYPE_TEXT = {
  TDec_1302: "a decimal with two places (TDec_1302), e.g. 12.50",
  TDec_1104: "a quantity with four decimals or none (TDec_1104), e.g. 3.0000",
  TProt: "a protocol number of 15 or 17 digits (TProt)",
  TData: "a date AAAA-MM-DD from 2000 to 2099 (TData)",
};

// Leaf validators: { type } (a tiposBasico pattern), { enum }, { str: [min, max] } (TString).
const leaf = (v) => ({ leaf: v });
const dec = leaf({ type: "TDec_1302" });
const qty = leaf({ type: "TDec_1104" });
const unit = leaf({ str: [1, 6] });
// The per-item group of the item events: vIBS, vCBS, then gControleEstoque(q, u[, vIBS, vCBS]).
const stockItem = (q, u, reversal = false) => [
  ["vIBS", 1, 1, dec], ["vCBS", 1, 1, dec],
  ["gControleEstoque", 1, 1, { kids: [[q, 1, 1, qty], [u, 1, 1, unit], ...(reversal ? [["vIBS", 1, 1, dec], ["vCBS", 1, 1, dec]] : [])] }],
];

/**
 * The event types read here. `body` is the detEvento sequence after descEvento, cOrgaoAutor,
 * tpAutor and verAplic (110001 has no tpAutor); `item` names the per-item group, with its
 * NF-e comparisons: `values` [IBS field, CBS field] checked against the NF-e item's IBS and
 * CBS (cStat 1097/1098), `qty` [quantity, unit, cStat] checked against det/prod/qCom when
 * the unit is the NF-e's uCom.
 */
export const RTC_EVENTS = {
  "112110": { section: "8.3", desc: "Informação de efetivo pagamento integral para liberar crédito presumido do adquirente", tpAutor: "1", author: "the NF-e's issuer", sha256: "10bf7c0df0038155201ea37d9c12b68b4cbea02867370afa3c4863af729b6016",
    body: [["indQuitacao", 1, 1, leaf({ enum: ["1"] })]] },
  "112120": { section: "8.14", desc: "Importação em ALC/ZFM não convertida em isenção", tpAutor: "1", author: "the NF-e's issuer (the importer in the ALC/ZFM)", file: "e112120_v1.00 .xsd", sha256: "27e654b1c7eee2feb4fffa694f0b5ee16618f61f7f849517a714c60cfd1e450c",
    item: { group: "gConsumo", kids: stockItem("qtde", "unidade") } },
  "112130": { section: "8.16", desc: "Perecimento, perda, roubo ou furto durante o transporte contratado pelo fornecedor", tpAutor: "1", author: "the NF-e's issuer", sha256: "1c1f5e024bc6fba5d5dc2ea01d49b20d089ec5870dc89bc7f17135610e7ca4e8",
    item: { group: "gPerecimento", kids: stockItem("qPerecimento", "uPerecimento", true) } },
  "112140": { section: "8.17", desc: "Fornecimento não realizado com pagamento antecipado", tpAutor: "1", author: "the issuer of the advance-payment debit note", sha256: "ec52646b5d7931dc87a41d6f11c585534d49bdf3d63ded6acbb52dc1b6bb4090",
    item: { group: "gItemNaoFornecido", kids: stockItem("qNaoFornecida", "uNaoFornecida") } },
  "112150": { section: "8.18", desc: "Atualização da Data de Previsão de Entrega", tpAutor: "1", author: "the NF-e's issuer", sha256: "f67b2a2dd0f6edd195ef2bb352956c624144232d2c59338567495fc55638dc7f",
    body: [["dPrevEntrega", 1, 1, leaf({ type: "TData" })]] },
  "211124": { section: "8.15", desc: "Perecimento, perda, roubo ou furto durante o transporte contratado pelo adquirente", tpAutor: "2", author: "the NF-e's buyer", sha256: "f3be0304553022bfb44852a023cc1853686f2ba5cb017dfc87dace87dfd85945",
    item: { group: "gPerecimento", kids: stockItem("qPerecimento", "uPerecimento") } },
  "211128": { section: "8.5", desc: "Aceite de débito na apuração por emissão de nota de crédito", tpAutor: "2", author: "the NF-e's buyer", sha256: "57a4df9a386af8b575ea1d5499a9b0b2dcb781169b40c390dfeb239f14605385",
    body: [["indAceitacao", 1, 1, leaf({ enum: ["0", "1"] })]] },
  "211130": { section: "8.6", desc: "Imobilização de Item", tpAutor: "2", author: "the NF-e's buyer", sha256: "9c6086a885c8f32c920437151aa3e6fa14f6f6f56055416805f3392c646fc0dd",
    item: { group: "gImobilizacao", kids: stockItem("qImobilizado", "uImobilizado"), values: ["vIBS", "vCBS"], qty: ["qImobilizado", "uImobilizado", "1100", "2P29-10"], rules: true } },
  "211140": { section: "8.7", desc: "Solicitação de Apropriação de Crédito de Combustível", tpAutor: "2", author: "the NF-e's buyer", sha256: "1081fbfdc78dbca20be80d9ee8abae094211100e4b5eea12c1b8c861e737619c",
    item: { group: "gConsumoComb", kids: stockItem("qComb", "uComb"), values: ["vIBS", "vCBS"], qty: ["qComb", "uComb", "1101", "2P28-10"], rules: true } },
  "211150": { section: "8.8", desc: "Solicitação de Apropriação de Crédito para bens e serviços que dependem de atividade do adquirente", tpAutor: "2", author: "the NF-e's buyer", sha256: "de2504594bc3c317adab421c52b8fad35ad6406519b7198bb0d90406a2c6d2b1",
    item: { group: "gCredito", kids: [["vCredIBS", 1, 1, dec], ["vCredCBS", 1, 1, dec]], values: ["vCredIBS", "vCredCBS"], rules: true } },
  "212110": { section: "8.9", desc: "Manifestação sobre Pedido de Transferência de Crédito de IBS em Operação de Sucessão", tpAutor: "8", author: "the successor company", sha256: "e4f76579f2324dccf361bcdfcc551e9ff5f021eefbb5ac8662c28fc12dcfe04a",
    ntDesc: "Manifestação sobre Pedido de Transferência de Crédito de IBS em Operações de Sucessão",
    body: [["indAceitacao", 1, 1, leaf({ enum: ["0", "1"] })]] },
  "212120": { section: "8.10", desc: "Manifestação sobre Pedido de Transferência de Crédito de CBS em Operação de Sucessão", tpAutor: "8", author: "the successor company", sha256: "bacfaf3ee4e5ecf5517e42892f172ebb016203c4198671129612d7f32e0a6ba5",
    ntDesc: "Manifestação sobre Pedido de Transferência de Crédito de CBS em Operações de Sucessão",
    body: [["indAceitacao", 1, 1, leaf({ enum: ["0", "1"] })]] },
  "110001": { section: "8.13", desc: "Cancelamento de Evento", tpAutor: null, author: "the author of the event it cancels", sha256: "d2e14b5d7215b64d2a893703143e158bc282084c08a08a794aded9bc6e834fe9",
    body: [["tpEventoAut", 1, 1, leaf({ enum: ["112110", "112120", "112130", "112140", "112150", "211110", "211120", "211124", "211128", "211130", "211140", "211150", "212110", "212120", "412120", "412130"] })], ["nProtEvento", 1, 1, leaf({ type: "TProt" })]] },
};
// Removed from the NT: { code: [what it was, the version that removed it, the last schema's package] }.
export const RTC_ELIMINATED = { "211120": ["Destinação de item para consumo pessoal", "1.40", "the v1.30 events package of 2025-10-07"] };
export const TIPOS_BASICO_SHA256 = "f20b13ad50eac1235aac2114fd1a98d89527c4bf895cb4e7a73342eaf53780da";
// Named in NT 2025.002 section 8.1 (or in 110001's list) but with no schema in the v1.40 package.
export const RTC_NO_SCHEMA = { "412120": "Manifestação do Fisco (IBS), sent by the tax authority", "412130": "Manifestação do Fisco (CBS), sent by the tax authority" };

function finding(rule, message, fix, path, severity) {
  const f = { rule, message, fix, path };
  if (severity) f.severity = severity;
  return f;
}
const named = (n) => (n?.children || []).filter((c) => c.name);
const kid = (n, name) => n?.children.find((c) => c.name === name);
const kidsOf = (n, name) => (n?.children || []).filter((c) => c.name === name);
const raw = (n, name) => kid(n, name)?.text ?? "";

// Children of `node` against an ordered list of [name, min, max]; returns problems.
export function sequence(node, spec) {
  const got = named(node).map((c) => c.name);
  const out = [];
  let i = 0;
  for (const [name, min, max] of spec) {
    let n = 0;
    while (got[i] === name) { n++; i++; }
    if (n < min) out.push(`${name} is missing${got[i] && spec.some(([s]) => s === got[i]) ? ` (or out of order: ${got[i]} comes first)` : ""}`);
    if (n > max) out.push(`${name} appears ${n} times; at most ${max}`);
  }
  if (i < got.length) out.push(`${got[i]} is not allowed here${spec.some(([s]) => s === got[i]) ? " (out of order)" : ""}`);
  return out;
}

// One leaf's text against its validator; returns a problem or "".
function leafProblem(name, v, spec) {
  const shown = JSON.stringify(v);
  if (spec.type) return T[spec.type].test(v) ? "" : `${name} ${shown} is not ${Object.hasOwn(TYPE_TEXT, spec.type) ? TYPE_TEXT[spec.type] : spec.type}`;
  if (spec.enum) return spec.enum.includes(v) ? "" : `${name} ${shown} is not ${spec.enum.length === 1 ? spec.enum[0] : `one of ${spec.enum.join(", ")}`}, the value${spec.enum.length === 1 ? "" : "s"} the schema allows`;
  if (spec.str) {
    const n = [...v].length;
    if (!TSTRING.test(v)) return `${name} ${shown} ${v ? "has a leading or trailing space or a character outside Latin-1" : "is empty"} (TString)`;
    if (n < spec.str[0] || n > spec.str[1]) return `${name} ${shown} has ${n} characters; the schema takes ${spec.str[0]} to ${spec.str[1]}`;
  }
  return "";
}

// Validate `node`'s children against a spec list [[name, min, max, {leaf}|{kids}], ...].
function validate(node, spec, path, label, out) {
  const fixOrder = `Order ${path.split("/").pop().replace(/\[\d+\]$/, "")} as ${spec.map(([n, min, max]) => `${n}${min === 0 ? " (optional)" : ""}${max > 1 ? ` (1 to ${max})` : ""}`).join(", ")}.`;
  for (const p of sequence(node, spec)) out.push(finding("BRE-030", `${label}${p} (SEFAZ cStat 493).`, fixOrder, path));
  for (const [name, , , s] of spec) {
    kidsOf(node, name).forEach((c, i) => {
      const many = kidsOf(node, name).length > 1;
      const cp = `${path}/${name}${many ? `[${i + 1}]` : ""}`;
      if (s.leaf) {
        if (named(c).length) { out.push(finding("BRE-030", `${label}${name} holds elements; the schema wants text (SEFAZ cStat 493).`, `Put only the value in ${name}.`, cp)); return; }
        const p = leafProblem(name, c.text ?? "", s.leaf);
        if (p) out.push(finding("BRE-030", `${label}${p} (SEFAZ cStat 493).`, `Correct ${name}.`, cp));
      } else if (s.kids) validate(c, s.kids, cp, label, out);
    });
  }
}

const num = (s) => (/^-?\d+(?:\.\d+)?$/.test(String(s ?? "").trim()) ? Number(String(s).trim()) : null);
const cents = (s) => (num(s) === null ? null : Math.round(num(s) * 100));
const sum = (...xs) => (xs.every((x) => x === null) ? null : xs.reduce((a, x) => a + (x ?? 0), 0));

/**
 * One NF-e item's IBS and CBS in cents and its commercial quantity and unit, for the
 * comparisons of 2P25/2P26 and 2P28/2P29. The IBS is gIBSCBS/vIBS (or vIBSUF + vIBSMun);
 * a monophase item (fuel) has gIBSCBSMono with vTotIBSMonoItem/vTotCBSMonoItem instead.
 */
export function nfeItemTaxes(det) {
  const prod = kid(det, "prod");
  const t = kid(kid(det, "imposto"), "IBSCBS");
  const g = kid(t, "gIBSCBS"), mono = kid(t, "gIBSCBSMono");
  let ibs = null, cbs = null, source = "";
  if (g) {
    ibs = kid(g, "vIBS") ? cents(raw(g, "vIBS")) : sum(cents(raw(kid(g, "gIBSUF"), "vIBSUF")), cents(raw(kid(g, "gIBSMun"), "vIBSMun")));
    cbs = cents(raw(kid(g, "gCBS"), "vCBS"));
    source = "gIBSCBS";
  } else if (mono) {
    ibs = cents(raw(mono, "vTotIBSMonoItem"));
    cbs = cents(raw(mono, "vTotCBSMonoItem"));
    source = "gIBSCBSMono";
  }
  return { qCom: num(raw(prod, "qCom")), uCom: raw(prod, "uCom").trim(), ibs, cbs, source };
}

const money = (c) => (c / 100).toFixed(2);

/**
 * Check the detEvento of an RTC event (any type in RTC_EVENTS but 211110). `ctx`:
 * { code, det, dpath, nfe } where nfe (optional) is { key, items: Map nItem -> det node }.
 * Pushes findings to `out` and returns { tpAutor, items }.
 */
export function checkRtcDetEvento({ code, det, dpath, nfe }, out, skipped) {
  const e = RTC_EVENTS[code];
  const meta = { name: e.desc };
  if (det.attrs.versao !== undefined && det.attrs.versao !== "1.00") out.push(finding("BRE-030", `detEvento/@versao is "${det.attrs.versao}"; the schema allows 1.00 (SEFAZ cStat 493).`, "Set detEvento versao=\"1.00\".", `${dpath}/@versao`));
  const head = [["descEvento", 1, 1, leaf({ enum: [e.desc] })], ["cOrgaoAutor", 1, 1, leaf({ enum: [...UFS] })]];
  if (e.tpAutor) head.push(["tpAutor", 1, 1, leaf({ enum: [e.tpAutor] })]);
  head.push(["verAplic", 1, 1, leaf({ str: [1, 20] })]);
  const spec = [...head, ...(e.body || []), ...(e.item ? [[e.item.group, 1, 990, { kids: e.item.kids }]] : [])];
  const before = out.length;
  validate(det, spec, dpath, "", out);
  // Friendlier messages for the commonest slips, replacing the generic one.
  for (let i = before; i < out.length; i++) {
    const f = out[i];
    if (f.path === `${dpath}/descEvento`) {
      const got = raw(det, "descEvento");
      const nt = e.ntDesc && got === e.ntDesc;
      f.message = `descEvento is "${got}"; the schema allows only "${e.desc}"${nt ? `. The text is the one NT 2025.002 section ${e.section} prints ("Operações"); the v1.40 schema says "Operação", and SEFAZ validates against the schema` : ""} (SEFAZ cStat 493).`;
      f.fix = `Set descEvento to "${e.desc}", accents included.`;
    } else if (f.path === `${dpath}/cOrgaoAutor`) {
      f.message = `cOrgaoAutor ${JSON.stringify(raw(det, "cOrgaoAutor"))} is not a state's IBGE code (TCodUfIBGE) (SEFAZ cStat 493).`;
      f.fix = "Give the author's state code (two digits, e.g. 35 for SP).";
    } else if (f.path === `${dpath}/tpAutor`) {
      f.message = `tpAutor is ${JSON.stringify(raw(det, "tpAutor"))}; event ${code} is sent by ${e.author}, tpAutor ${e.tpAutor}, the only value its schema allows (SEFAZ cStat 493).`;
      f.fix = `Set tpAutor to ${e.tpAutor}${e.tpAutor === "1" ? " and send from the issuer's CNPJ" : e.tpAutor === "2" ? " and send from the buyer's CNPJ or CPF" : ""}.`;
    }
  }
  meta.tpAutor = raw(det, "tpAutor") || null;
  if (code === "110001") {
    meta.tpEventoAut = raw(det, "tpEventoAut");
    meta.nProtEvento = raw(det, "nProtEvento");
    const f = meta.tpEventoAut === "110001" && out.slice(before).find((x) => x.path === `${dpath}/tpEventoAut`);
    if (f) f.message += " A cancellation cannot itself be cancelled (rule P23-10).";
  }
  if (!e.item) return meta;

  // ---- items: unique nItem (pk_nItem), and the NF-e comparisons ----
  const seen = new Set();
  const groups = kidsOf(det, e.item.group);
  meta.items = groups.length;
  const nfeItems = nfe?.items instanceof Map ? nfe.items : null;
  groups.forEach((g, i) => {
    const gp = `${dpath}/${e.item.group}[${i + 1}]`;
    const n = g.attrs.nItem;
    const label = `Item ${n ?? i + 1}: `;
    if (n === undefined) { out.push(finding("BRE-030", `${e.item.group} ${i + 1} has no nItem attribute (SEFAZ cStat 493).`, "Give the det/@nItem of the NF-e item.", gp)); return; }
    if (!T.TnItem.test(n)) { out.push(finding("BRE-030", `nItem ${JSON.stringify(n)} is not 1 to 990 (TnItem) (SEFAZ cStat 493).`, "Give the det/@nItem of the NF-e item.", `${gp}/@nItem`)); return; }
    if (seen.has(n)) { out.push(finding("BRE-030", `nItem ${n} appears twice; the schema's pk_nItem keeps one group per item (SEFAZ cStat 493).`, "Merge the two groups, or fix the item number.", `${gp}/@nItem`)); return; }
    seen.add(n);
    if (!nfeItems) return;
    const det2 = nfeItems.get(n);
    if (!det2) {
      out.push(finding("BRE-014", `${label}the NF-e has no det with nItem ${n}${e.item.rules ? " (SEFAZ cStat 1096, rule 2P24-10)" : `. Section ${e.section} lists no rule for this event, so this is a warning`}.`, "Use the item numbers of the NF-e the key names.", `${gp}/@nItem`, e.item.rules ? undefined : "warning"));
      return;
    }
    const it = nfeItemTaxes(det2);
    if (e.item.values) {
      const [fi, fc] = e.item.values;
      for (const [field, have, part, cStat, rule] of [[fi, it.ibs, "IBS", "1097", "2P25-10"], [fc, it.cbs, "CBS", "1098", "2P26-10"]]) {
        const v = cents(raw(g, field));
        if (v === null || !T.TDec_1302.test(raw(g, field))) continue;
        if (have === null) { skipped.push(`${gp}/${field}: NF-e item ${n} has no ${part} value (no IBSCBS/gIBSCBS or gIBSCBSMono), so ${cStat} was not checked`); continue; }
        if (v > have) out.push(finding("BRE-031", `${label}${field} ${money(v)} is more than the NF-e item's ${part}, ${money(have)} (${it.source}) (SEFAZ cStat ${cStat}, rule ${rule}).`, `Claim at most the item's ${part} of ${money(have)}, or check the item number.`, `${gp}/${field}`));
      }
    }
    if (e.item.qty) {
      const [qf, uf, cStat, rule] = e.item.qty;
      const st = kid(g, "gControleEstoque");
      const q = num(raw(st, qf)), u = raw(st, uf);
      if (q === null || !T.TDec_1104.test(raw(st, qf))) return;
      if (u !== it.uCom) { if (u) skipped.push(`${gp}/gControleEstoque: unit ${u} is not the NF-e item's uCom ${it.uCom || "(none)"}; rule ${rule} compares quantities only in the same unit`); return; }
      if (it.qCom !== null && q > it.qCom) out.push(finding("BRE-032", `${label}${qf} ${raw(st, qf)} ${u} is more than the NF-e item's qCom ${it.qCom} ${it.uCom} (SEFAZ cStat ${cStat}, rule ${rule}).`, `Give at most the item's quantity of ${it.qCom}.`, `${gp}/gControleEstoque/${qf}`));
    }
  });
  return meta;
}

/**
 * A cancellation (110001) against the event it cancels, given as the text-parsed pieces:
 * cancel = { chNFe, seq, author, orgao, tpEventoAut, nProt, path }, orig = the same read from
 * the cancelled event's procEventoNFe: { chNFe, tpEvento, seq, author, orgao, nProt }.
 * Rules 1P06-10 (459), 1P10-10 (1113), 1P20-10 (1178), 1P24-10 (460) of section 8.13.3.
 */
export function checkCancelAgainst(cancel, orig, out) {
  const p = cancel.path;
  if (orig.chNFe !== cancel.chNFe || orig.tpEvento !== cancel.tpEventoAut || Number(orig.seq) !== Number(cancel.seq)) {
    out.push(finding("BRE-033", `The cancellation names event ${cancel.tpEventoAut} with nSeqEvento ${cancel.seq} on key ${cancel.chNFe}; the event given is ${orig.tpEvento} with nSeqEvento ${orig.seq} on ${orig.chNFe}. SEFAZ finds the event by key, type and sequence number, so the cancellation's nSeqEvento is the cancelled event's (SEFAZ cStat 459, rule 1P06-10).`, "Copy chNFe, the event type (as tpEventoAut) and nSeqEvento from the event being cancelled.", `${p}/nSeqEvento`));
    return;
  }
  if (orig.author && cancel.author && orig.author !== cancel.author) out.push(finding("BRE-033", `The cancellation is sent by ${cancel.author}; the event it cancels was sent by ${orig.author} (SEFAZ cStat 1113, rule 1P10-10).`, "Send the cancellation from the same CNPJ or CPF as the event.", `${p}/CNPJ`));
  if (orig.orgao && cancel.orgao && orig.orgao !== cancel.orgao) out.push(finding("BRE-033", `cOrgaoAutor is ${cancel.orgao}; the event it cancels gave ${orig.orgao} (SEFAZ cStat 1178, rule 1P20-10).`, `Set cOrgaoAutor to ${orig.orgao}.`, `${p}/detEvento/cOrgaoAutor`));
  if (orig.nProt && cancel.nProt && orig.nProt !== cancel.nProt) out.push(finding("BRE-033", `nProtEvento ${cancel.nProt} is not the protocol SEFAZ gave the event, ${orig.nProt} (SEFAZ cStat 460, rule 1P24-10).`, `Set nProtEvento to ${orig.nProt}.`, `${p}/detEvento/nProtEvento`));
  if (!orig.nProt) return "the event given has no retEvento protocol (nProt), so nProtEvento (460) was not compared";
  return "";
}
