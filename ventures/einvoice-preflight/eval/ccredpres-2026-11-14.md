# The presumed-credit checks on public NF-e files, 2026-11-14

What was built: `ccredpres.mjs` (BR-058..BR-061 in `nfe.mjs`) and the cClassTrib table
brought up to IT 2025.002 1.71 (`UPDATES` in `build-cclasstrib-data.mjs`). README,
"Brazil: the cCredPres table and the presumed-credit rules".

## Sources and how they were checked

| What | Source | Check |
|---|---|---|
| cCredPres table, 13 codes | `biuspoly/RNFe@b744e7d4cd9b` `inst/extdata/tabelas/credito_presumido_ibs_cbs.csv` (MIT), SHA-256 `f7b2a1e0...` | Compared with `Hinten/next_erp` `packages/schemas/src/imposto/ccredpres.ts` (Apache-2.0, hand-transcribed from SVRS 2026-09-28) and `celsonaemen/verificadoripost` `ccredpress.json`: every code, IBS/CBS flag and start date agrees. Codes 01 and 03 "Apropria DFe": 0 in RNFe, 1 in both others; RNFe's `mudancas_ibs_cbs.csv` dates the switch to IT 2025.002 1.70 (published 2026-10-01), after both were taken. |
| Rejection rules UB120-UB130 | NT 2025.002-RTC section 7, version 1.51, transcribed at `higajooj/dfe_law_reference@7871ab40116f` `src/nfe/nt2025-002/07-regras-de-validacao/index.md` | RNFe's `regras_ibs_cbs.csv` lists the same rule ids, cStat codes and messages (1049, 1050, 1053-1056, 1058, 1060, 1107, 1124, 1175). |
| cClassTrib changes 1.60-1.71 | RNFe `mudancas_ibs_cbs.csv` and `classificacao_ibs_cbs.csv` (173 codes) | Field-by-field against `cclasstrib-data.mjs`: every difference other than start dates is one the change log records; after `UPDATES`, 0 differences on CST, NF-e/NFC-e/NFS-e flags, reductions, end date, presumed-credit and reversal groups. |

The primary host, `dfe-portal.svrs.rs.gov.br`, refused the build host's connection
(agent proxy `connect_rejected`, 2026-11-14), so every source above is a transcription.

## The corpus

`node eval/ccredpres-corpus.mjs` (127 files from three GitHub code searches,
`eval/ccredpres-corpus-list.txt`):

```
read: {"nfe":24,"withCredPres":15,"other":80,"missing":0,"duplicate":30}
cCredPres codes used: {"00":2,"01":5,"cCredPres1".."cCredPres9":1 each,"string":7}
rules: {"BR-056":2,"BR-058":2,"BR-061 (warning)":8,"BR-059":4}
```

| File | Code | Finding |
|---|---|---|
| Unimake/Uninfe `.../CST_410_CLASSTRIB_410014_ProdutorRuralNaoContribuinteComCreditoPresumido.xml` (dhEmi 2026-10-29) | 01 | cStat 1175: 410014 lost its presumed-credit group in 1.70 (production 2026-10-16). Warnings: 01 is event-only since 1.70; the credit starts 2027-01-01. Under the June table BR-056 did not fire on it. |
| Unimake/DFe `.../NFeRTC2.xml` | 00 | 1055 (no code 00) and 1175 (410999 takes no presumed credit) |
| automacoescomerciaisintegradas/orcamento `.../nfce/.../teste-xml-valido-1.xml` | 00 | 1049: an NFC-e with gCredPresOper |
| icaroraci/tooldoce `caso_007.xml` | 01 | 1054 and 1058: neither group |
| icaroraci/tooldoce `caso_008.xml` | 01 | 1054: no IBS group |
| icaroraci/tooldoce `caso_009.xml` | 01 | 1058: no CBS group |
| Unimake/DFe `enviNFe2.xml` | 01 | not read: an `enviNFe` batch (BR-001) |
| sped-nfe (7 files), Uninfe "Maximo de tags" | `string`, `cCredPres1..9` | schema placeholders (BR-004), no table finding |

All six errors are on samples and test files. None is a misread: each matches the rule
text quoted in `ccredpres.mjs`. Not done: a real SEFAZ rejection to compare against; the
presumed-credit appropriation event (e211110), where codes the table marks as
event-only belong, is not read.
