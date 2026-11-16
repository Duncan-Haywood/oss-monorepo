# A city's own ISS rate: Curitiba (ABR-025, NFSE-037), 2026-11-16

**What was built.** `iss-city-rates.mjs` now holds Curitiba's (IBGE 4106902) ISS rates beside São
Paulo's and Rio de Janeiro's. ABR-025 (ABRASF `MunicipioIncidencia`, else the issuing city, which
covers ISSCuritiba 1.00 files) and NFSE-037 (national `cLocIncid`) compare the stated rate with them.

**Sources, all read 2026-11-16.**

| text | where | touches art. 4? |
|---|---|---|
| LC 40/2001, consolidated up to LC 112/2018 | mid.curitiba.pr.gov.br/2020/00293800.pdf | the base text |
| LC 106/2017 | mid.curitiba.pr.gov.br/2018/00217719.pdf | adds VI (SUS, 2%) and art. 4-A (2% floor) |
| LC 107/2017 | mid.curitiba.pr.gov.br/2018/00217720.pdf | rewrites I-III; § 3 vetoed |
| LC 119/2020 | mid.curitiba.pr.gov.br/2022/00348657.pdf | no |
| LC 134/2022 | mid.curitiba.pr.gov.br/2022/00361219.pdf | adds I, n (franchising); revokes V (5% withholding) |
| LC 146/2025 (9 June 2025) | legisweb.com.br id 479376 | III, b: "cooperativas de serviços de saúde" |

No amendment to art. 4 from 2023 or 2024 turned up in two searches. That does not prove there was
none: the city council's site (cmc.pr.gov.br) and curitiba.pr.gov.br answer 403 from the build host.
A 2025 council news item mentions a bill to put informatics in I (2%); its status could not be read
(403). If it passed, 2% on item 1 is already accepted (below), so the table would not misfire.

**What art. 4 sets, by LC 116 subitem.** Curitiba's Anexo I keeps LC 116's numbers and its vetoed
gaps (3.01, 7.14, 7.15, 13.01 and 17.07 read "(VETADO)"; 17.08 is franchising, 21.01 registries),
so unlike São Paulo and Rio no renumbering is needed and the message adds no "own list numbers" note.

| rate | clause | whole subitems (the clause's words are the subitem's text) | part of a subitem (accepted beside 5%) |
|---|---|---|---|
| 2% | I, a-n | 16.01, 15.09, 8.01, 12.01, 12.03, 12.04, 12.07, 12.08, 12.10, 12.11, 12.13, 17.08 | I, c (recipient abroad, § 2) and I, e (call centres, remote support, § 1) name no subitem: any subitem |
| 2.5% | II | 11.02, 13.05, 14.04 | 7.10 cleaning and upkeep, 10.01 insurance brokerage, 10.09 commercial representation |
| 4% | III | 4.22, 4.23, 21.01 | 4.03 hospitals and the like |
| 2% | VI (SUS) | | 4.01-4.03, 4.17, 4.19, 4.20 (inside the any-subitem 2%) |
| 5% | IV | everything else | |

Before LC 146/2025, III, b read "cooperativas de serviços" (any cooperative), so for 2024 and 2025
competences 4% is accepted on every subitem. Years read: 2024-2028 (from 2029 LC 116 art. 8-B cuts
every rate).

**What it catches, and what it cannot.** A rate Curitiba never sets for the service: São Paulo's
2.9% for software, Rio's 3% for construction, 4% outside health and registries (from 2026), 2.5%
outside the six II services. It cannot catch a wrong 2%: because I, c and e name no subitem, 2% is a
rate the law can set for any service, so a domestic software house filing 2% in Curitiba passes. A
check that wanted to judge 2% would need the buyer's country and the service's channel, which an
NFS-e only partly carries.

**Corpus.** GitHub code search (`MunicipioIncidencia 4106902`, `cLocIncid 4106902`, `4106902
Aliquota ItemListaServico`, `isscuritiba Aliquota`, `pAliqAplic 4106902`): 80 distinct blobs, 21 XML
(outside this repository), all downloaded from raw.githubusercontent.com to a scratch directory; 19
name 4106902. `node eval/iss-city-rates-curitiba-corpus.mjs <dir>` prints one row per file.

- 9 have Curitiba as the city of incidence. Only 2 are judged: Unimake's GISSONLINE 2.04 and 2.05
  examples, 5% on 1.01 in 2025, not Simples Nacional; both pass. The other 7 are Simples Nacional
  or MEI and are skipped by design: 2 nfephp-org/sped-da ABRASF fixtures at 5% on 1.01, 3 national
  NFS-e at 2% on 1.01 (ME/EPP), 1 at 2% on 1.07 (MEI), 1 MEI file with no rate. Read as if judged,
  all 7 would pass.
- 7 ISSCuritiba 1.00 and GINFES files from 2015-2016 at 0.02 on 14.01 or 1.03, all Simples Nacional
  and outside the years read; read without the year, they pass too.
- 3 name Curitiba only as a party (incidence 3542404 and 3305208).

Flagged: 0 of 19. All are test fixtures or examples and only 2 reach the check, so this is a
small false-alarm reading on what developers actually write, not a catch rate; no production
Curitiba file was found.

**Not done.** Belo Horizonte: Lei 8.725/2003 art. 13 (rewritten by Lei 9.799/2009 and later laws);
fazenda.pbh.gov.br (the consolidated text), dom-web.pbh.gov.br, okai.com.br and leismunicipais.com.br
all answer 403 from the build host and cmbh.mg.gov.br renders the law text by script. A session with
a browser or another egress could read it.
