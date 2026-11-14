// Reads Brazil's IBS/CBS classification table (CST and cClassTrib, the "Tabela de
// Classificação Tributária" of the tax reform, LC 214/2025) into cclasstrib-data.mjs,
// the table cclasstrib.mjs checks NF-e, NFC-e and national NFS-e items against:
//   node build-cclasstrib-data.mjs [path to a JSON dump]
// The table is published by the Receita Federal and the Comitê Gestor do IBS through the
// Portal da Conformidade Fácil (CFF, svrs.rs.gov.br), whose classTrib query answers with
// exactly this JSON (a list of CSTs, each with its classificacoesTributarias). The
// government hosts (svrs.rs.gov.br, nfe.fazenda.gov.br, gov.br) refused the build host's
// connection on 2026-11-13, so without an argument it downloads a copy of that answer
// committed to a public repository, pinned below by commit and SHA-256. Two independent
// copies were compared with it on 2026-11-13 (docs in README "Brazil: the cClassTrib
// table"): a 2026-04-15 lookup (156 codes, every one present here with the same name)
// and a 2025-05-19 spreadsheet export (142 codes; CST and both reduction percentages
// agree on all 138 shared codes; its 4 others were dropped from the table since).
// The table is an official act (Lei 9.610/1998, art. 8, IV: not protected by copyright);
// the data module keeps only the fields the checks read.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const SOURCE_REPO = "souzamonteiro/nfeemissor";
export const SOURCE_COMMIT = "3a1610e3053e27417f28277ecdec009cf62843fb";
export const SOURCE_PATH = "nfeemissor/tabelas/consulta-tributacao-rtc.json";
export const SOURCE_SHA256 = "1fe9351295a8de2df2b448eae6610621a1655ecb63024c87dc88fa456bdc0bd2";

async function load() {
  if (process.argv[2]) return readFileSync(process.argv[2], "utf8");
  const res = await fetch(`https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_COMMIT}/${SOURCE_PATH}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const text = await load();
const sha = createHash("sha256").update(text).digest("hex");
if (!process.argv[2] && sha !== SOURCE_SHA256) throw new Error(`SHA-256 ${sha} is not the pinned ${SOURCE_SHA256}`);
const day = (s) => (s ? String(s).slice(0, 10) : "");
const csts = {}, codes = {};
let published = "";
for (const c of JSON.parse(text)) {
  csts[c.CST] = {
    name: c.DescricaoCST,
    // Which item group the CST takes (the table's group indicators; TTribNFe offers
    // gIBSCBS | gIBSCBSMono | gTransfCred | gAjusteCompet, then gCredPresOper | gCredPresIBSZFM).
    ibscbs: !!c.IndIBSCBS, mono: !!c.IndIBSCBSMono, transf: !!c.IndTransfCred, ajuste: !!c.IndAjusteCompet,
    zfm: !!c.IndCredPresIBSZFM, redAliq: !!c.IndRedAliq, redBC: !!c.IndRedBC, dif: !!c.IndDif,
  };
  for (const k of c.classificacoesTributarias) {
    if (day(k.Publicacao) > published) published = day(k.Publicacao);
    codes[k.cClassTrib] = {
      cst: c.CST, name: k.DescricaoClassTrib, pRedIBS: Number(k.pRedIBS), pRedCBS: Number(k.pRedCBS),
      from: day(k.InicioVigencia), to: day(k.FimVigencia),
      nfe: !!k.IndNFe, nfce: !!k.IndNFCe, nfse: !!k.IndNFSE,
      credPres: !!k.IndCredPresOper, estorno: !!k.IndEstornoCred, regular: !!k.IndTribRegular,
    };
  }
}
// Changes to the table since the pinned copy (published 2026-06-22), applied on top: the
// IT 2025.002 versions 1.60 (2026-06-23) and 1.70 (2026-10-01, in production 2026-10-16)
// as biuspoly/RNFe@b744e7d4cd9b records them (inst/extdata/tabelas/mudancas_ibs_cbs.csv,
// MIT), limited to the fields this module keeps. Compared on 2026-11-14 with that
// repository's full table (classificacao_ibs_cbs.csv, 173 codes): after these, every code
// agrees on CST, documents, reductions, end date and the presumed-credit and reversal
// groups. Its start dates differ (it writes 2026-01-01 for every code that started
// earlier), and the pinned copy's are kept. README, "Brazil: the cClassTrib table".
export const UPDATES = {
  version: "1.71",
  set: {
    "410014": { credPres: false }, // 1.70: grupo_credito_presumido 1 -> 0
    "410022": { nfe: true }, "410023": { nfe: true }, "410024": { nfe: true }, "410025": { nfe: true }, // 1.70
    "410028": { nfse: false }, // 1.70
    "550002": { nfe: false }, // 1.60
  },
  // 1.70: new codes ("existe" 0 -> 1), as that table states them.
  add: {"000006": {"cst": "000","name": "Situações tributadas integralmente pelo IBS e CBS.realizadas por autônomo","pRedIBS": 0,"pRedCBS": 0,"from": "2026-01-01","to": "","nfe": false,"nfce": false,"nfse": true,"credPres": false,"estorno": false,"regular": false},"200055": {"cst": "200","name": "Fornecimento dos serviços com redução de alíquota de 60% realizado por autônomo, observado o art. 128 da Lei Complementar nº 214, de 2025.","pRedIBS": 60,"pRedCBS": 60,"from": "2026-01-01","to": "","nfe": false,"nfce": false,"nfse": true,"credPres": false,"estorno": false,"regular": false},"200056": {"cst": "200","name": "Fornecimento dos serviços com redução de alíquota de 30% realizado por autônomo, observado o art. 127 da Lei Complementar nº 214, de 2025.","pRedIBS": 30,"pRedCBS": 30,"from": "2026-01-01","to": "","nfe": false,"nfce": false,"nfse": true,"credPres": false,"estorno": false,"regular": false},"400003": {"cst": "400","name": "Bagagens de viajantes e de tripulantes, acompanhadas ou desacompanhadas, observado o art. 94 da Lei Complementar nº 214, de 2025.","pRedIBS": 0,"pRedCBS": 0,"from": "2026-01-01","to": "","nfe": false,"nfce": false,"nfse": false,"credPres": false,"estorno": false,"regular": false},"400004": {"cst": "400","name": "Remessas internacionais, observado o art. 94 da Lei Complementar nº 214, de 2025.","pRedIBS": 0,"pRedCBS": 0,"from": "2026-01-01","to": "","nfe": false,"nfce": false,"nfse": false,"credPres": false,"estorno": false,"regular": false},"550026": {"cst": "550","name": "Regimes de admissão temporária com suspensão total do pagamento dos tributos durante o período de sua permanência na Zona Franca de Manaus, observado o art. 89 da Lei Complementar nº 214, de 2025.","pRedIBS": 0,"pRedCBS": 0,"from": "2026-01-01","to": "","nfe": true,"nfce": false,"nfse": false,"credPres": false,"estorno": false,"regular": true},"550027": {"cst": "550","name": "Regimes de Aperfeiçoamento (Drawback), observado o art. 90 da Lei Complementar nº 214, de 2025.","pRedIBS": 0,"pRedCBS": 0,"from": "2026-01-01","to": "","nfe": true,"nfce": false,"nfse": false,"credPres": false,"estorno": false,"regular": true},"550028": {"cst": "550","name": "Regimes de Aperfeiçoamento (Admissão temporária), observado o art. 90 da Lei Complementar nº 214, de 2025.","pRedIBS": 0,"pRedCBS": 0,"from": "2026-01-01","to": "","nfe": true,"nfce": false,"nfse": false,"credPres": false,"estorno": false,"regular": true},"550029": {"cst": "550","name": "Zona de Processamento de Exportação, observado os art. 102 da Lei Complementar nº 214, de 2025.","pRedIBS": 0,"pRedCBS": 0,"from": "2026-01-01","to": "","nfe": true,"nfce": false,"nfse": false,"credPres": false,"estorno": false,"regular": true}},
};
for (const [k, v] of Object.entries(UPDATES.set)) { if (!codes[k]) throw new Error(`update for missing ${k}`); Object.assign(codes[k], v); }
for (const [k, v] of Object.entries(UPDATES.add)) { if (codes[k]) throw new Error(`${k} already in the table`); codes[k] = v; }

const body = `// Generated by build-cclasstrib-data.mjs from ${SOURCE_REPO}@${SOURCE_COMMIT.slice(0, 12)}:${SOURCE_PATH}
// (SHA-256 ${sha.slice(0, 16)}...), the Conformidade Fácil classTrib table as published ${published},
// with the changes of IT 2025.002 up to ${UPDATES.version} applied (UPDATES in the builder).
// Do not edit by hand; rebuild.
export const TABLE = ${JSON.stringify({ published, updates: UPDATES.version, sha256: sha, codes: Object.keys(codes).length })};
export const CST = ${JSON.stringify(csts)};
export const CODES = ${JSON.stringify(codes)};
`;
writeFileSync(new URL("./cclasstrib-data.mjs", import.meta.url), body);
console.log(`cclasstrib-data.mjs: ${Object.keys(csts).length} CSTs, ${Object.keys(codes).length} codes, published ${published}`);
