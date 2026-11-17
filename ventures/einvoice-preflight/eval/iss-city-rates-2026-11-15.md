# A city's own ISS rate: São Paulo (ABR-025, NFSE-037), 2026-11-15

**What was built.** `iss-city-rates.mjs` holds São Paulo's ISS rate for every LC 116 service
subitem, read from Lei 13.701/2003 art. 16, and the two NFS-e checkers compare a stated rate with
it where the ISS is due in São Paulo (IBGE 3550308): `ABR-025` (ABRASF `MunicipioIncidencia`, else
the issuing city) and `NFSE-037` (national NFS-e `cLocIncid`). ABR-024/NFSE-024 already checked the
national 2% to 5% band; a rate inside the band can still be wrong for the city.

**Source.** The consolidated text of Lei 13.701/2003 on legislacao.prefeitura.sp.gov.br (read
2026-11-15). The page carries every wording of art. 16 with the law that gave it; the current
wording is the last of each clause. Its list of amending laws ends with Lei 18.095/2024 and Lei
18.270/2025, neither of which changes art. 16. Current art. 16: 2% (I, a: items 4 and 5 and 16
named subitems; I, e, k and r: 12.11, 21.01, 17.07 whole; I, b-r: named parts of other subitems),
2.5% (II: stands in 3.02, and 17.09), 2.9% (III: item 1 except 1.09, and 17.24), 5% (IV: the rest).

**The numbering trap.** São Paulo's service list (art. 1) is not numbered like LC 116's. LC 116
vetoed 3.01, 7.14, 7.15, 13.01 and 17.07 and left the gaps; São Paulo closed them. Matching each
of São Paulo's 200 subitem texts to LC 116's (the LC 116 text from the planalto.gov.br mirror used
for ABR-024; difflib ratio on normalised text) gives exactly four shifted runs, all at ratio 1.0:

| São Paulo | LC 116 |
|---|---|
| 3.01-3.04 | 3.02-3.05 |
| 7.14-7.20 | 7.16-7.22 |
| 13.01-13.04 | 13.02-13.05 |
| 17.07-17.24 | 17.08-17.25 |

Every other subitem keeps its number (four apparent mismatches were ties between identical texts,
e.g. 4.18 and 5.04 "Inseminação artificial", and the last item swallowing a paragraph; checked by
hand). NFS-e files carry LC 116's numbers, so the table is keyed by them: the 2.9% São Paulo writes
for "17.24" (advertising insertion) is LC 17.25, and its 2% "13.04" (graphic composition) is LC
13.05. A table keyed by São Paulo's numbers would put LC 17.25 at the default 5%.

**Corpus.** GitHub code search (`cLocIncid 3550308`, `MunicipioIncidencia 3550308`, `pAliqAplic
3550308`, `Aliquota 3550308 ItemListaServico`, XML files): 75 distinct blobs, 70 downloaded to a
scratch directory, read, not copied. 35 name São Paulo as the city of incidence; 21 of those carry
a nonzero rate.

**Result.**

| | files |
|---|---|
| São Paulo as city of incidence | 35 |
| issued by São Paulo's own system in production (`ambGer` 1, `tpAmb` 1) | 4: all pass |
| flagged (ABR-025 / NFSE-037) | 10: none a real issued file |
| rate in São Paulo's table, other files | 5 |
| not judged (special regime, Simples Nacional ME/EPP) | 2 |
| no rate or a zero rate | 14 |

The four production files: three at 2% on LC 17.12 (São Paulo's 17.11, "administração em geral";
2% for vouchers and platform administration, I, l and o) and one at 2.9% on **LC 17.25**, which is
São Paulo's 17.24 at III: the renumbering confirmed on a real file.

The ten flagged files: four are this venture's own made-up fixtures as they stood on `main` (5% on
LC 1.01 and 1.07 in São Paulo, which taxes item 1 at 2.9%; fixed in this change and every amount
recomputed by hand); three are another project's synthetic fixtures (made-up names, test CNPJ
11.222.333/0001-44; LC 1.05 at 2% and 5%); one a PHP library's sample ("Servicos de exemplo", 21.01
at 4%); one an R package's example (1.05 at 2%, homologation); one a made-up ABRASF reply (CNPJ
12.345.678/0001-99, verification code ABCX-1234; 1.01 at 2%). None is a real issued note, so the
false-positive rate on real files is 0 of 4, which is a small sample.

**Limits.** One city. Part-of-subitem rates (I, b-r; II, a) are accepted beside the subitem's
general rate because the file cannot say which part the service is. Judged for competences 2024 to
2028 only (Lei 18.066/2023 moved 1.09 to 2%; from 2029 LC 116 art. 8-B cuts every municipal rate).
Simples Nacional, MEI and special regimes are not judged. São Paulo's own NFS-e layout (Paulistana,
with its own five-digit service codes) is not read. No rejection from São Paulo was compared.

Reproduce: `node eval/iss-city-rates-corpus.mjs <dir>` over the downloaded files.
