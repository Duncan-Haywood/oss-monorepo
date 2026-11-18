# Rio de Janeiro's own service codes (ABR-026), 2026-11-16

**What was built.** `rio-service-codes.mjs` and its data file, built by `build-rio-codes.mjs`:
Rio de Janeiro's Tabela de Códigos de Serviços, the six-digit codes a Nota Carioca NFS-e writes in
`CodigoTributacaoMunicipio`, with the day each came onto the table and went off it. `ABR-026` in
`abrasf.mjs` compares the code with the table and with `ItemListaServico` on files issued by Rio's
system (IBGE 3304557).

**Sources** (read 2026-11-16; municipal acts are public law, the codes and short descriptions kept):

| act | what it does | where read |
|---|---|---|
| Portaria F/SUBTF/CIS 256/2018 (DO-Rio 1 Aug 2018) | the table, 963 codes | contabeis.com.br (the act as published) and normasbrasil.com.br (consolidated): all 963 texts agree |
| Portaria SUBTF/CIS 269/2020 (4 Feb 2020) | adds 16.02.05, 16.02.06 | normasbrasil's consolidated annotations |
| Portaria FP/SUBEX/REC-RIO/CIS 282/2021 (in force 20 Dec 2021) | adds 02.01.03, 02.01.04, 11.05.01 | same |
| Portaria FP/SUBEX/REC-RIO/CIS 286/2022 (DO-Rio 11 Jul 2022, in force the third working day after: 14 Jul) | excludes 18 hotel-works codes (07.02.02-05, 07-10, 12, 14, 16, 18, 20, 71; 07.05.06, 12, 18, 41) | its own text and the consolidated marks agree |
| Portaria CIS/F/REC-RIO 321/2025 (DO-Rio 18 Dec 2025, in force 1 Jan 2026) | adds 30 codes, excludes 19; art. 3 makes the codes the "códigos originais do município" behind the national NFS-e's municipal tax codes | normasbrasil |

269/2020's in-force date was not read; the act's date is used, which can only make the check more
lenient. An act after 321/2025 that was not found would show as a code "not on the table"; the fix
text says so.

**The numbering.** The table's first four digits are LC 116's subitems, not the renumbered list
of Rio's own Lei 691/1984 art. 8 that the rate check converts (iss-city-rates.mjs): it has 03.05,
07.16-07.22, 13.05 and 17.08-17.25, which art. 8's list lacks, and 321/2025's 07.17.02
("escoramento, contenção de encostas") and 07.20.11 ("topografia") sit under LC 7.17 and 7.20's
wording. So a code must start with `ItemListaServico` as written.

**Rule.** On a file whose issuing city (OrgaoGerador, provider address, else on an RPS the
service's CodigoMunicipio) is 3304557: a code that is not six digits; a code not on the table; a
code of another subitem; a code not on the table at the competence date (Competencia, else
DataEmissao). Before 1 Aug 2018 only the subitem is compared, with a note. Where the ISS is due
does not matter: the code is the issuing city's.

**Corpus.** GitHub code search (`CodigoTributacaoMunicipio 3304557`, `notacarioca
CodigoTributacaoMunicipio`, `CodigoTributacaoMunicipio ItemListaServico 3304557 extension:xml`,
`nota carioca CodigoTributacaoMunicipio extension:xml`): 74 blobs downloaded from
raw.githubusercontent.com to a scratch directory, read, not copied; 59 distinct texts, 29 ABRASF
files with a CodigoTributacaoMunicipio.

| | files |
|---|---|
| issued by Rio's system | 22 |
| flagged | 0 |
| dated after 1 Aug 2018, compared on the table | 5 (010401 on 0104, 2022; 170205 on 1702, 2021, four copies) |
| dated 2009-2010, subitem compared, note | 17 (010201 on 0102, 140520 on 1405) |
| naming 3304557 but not issued by Rio (not judged) | 5: four Niterói (3303302) SIGCORP/FISCO samples whose buyer is in Rio, which write `16.02` as the code, and one code template with no issuing city |

The Niterói samples are why the rule follows the issuing city: their `16.02` is not one of Rio's
codes, but Rio's table does not govern them.

**Planted faults** (`node eval/rio-service-codes-corpus.mjs <dir>`, second line): on each of the 22
Rio files, the code replaced by another subitem's, cut to four digits, given an unknown last pair;
on the 5 dated after 2018, also 07.02.47 (excluded by 321/2025) dated 2026 and 07.02.87 (added by
it) dated 2025: **76 of 76 caught**.

**Limits.** No Nota Carioca rejection was compared, so this is the table's rule as the act states
it, not the web service's error text. The national NFS-e's `cTribMun` is the national system's
three-digit parameter linked to Rio's codes inside the system; the link is not published in a
file, so national files are not judged. The pre-2018 table (Resolução SMF 2.617/2010's annex and
its amendments) is not read. Other cities' code tables (São Paulo's five-digit codes, BH's CTISS)
are not read.

Reproduce: `RIO_PAGES=<dir> node build-rio-codes.mjs` (base.html, consolidated.html, p321.html
saved from the three URLs in the script) or `node build-rio-codes.mjs` to fetch them; then
`node eval/rio-service-codes-corpus.mjs <dir>` over the downloaded files.
