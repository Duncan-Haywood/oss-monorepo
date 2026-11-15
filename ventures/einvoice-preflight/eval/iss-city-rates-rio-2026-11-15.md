# A city's own ISS rate: Rio de Janeiro (ABR-025, NFSE-037), 2026-11-15

**What was built.** `iss-city-rates.mjs` now holds Rio de Janeiro's (IBGE 3304557) ISS rates beside
São Paulo's. ABR-025 (ABRASF `MunicipioIncidencia`, else the issuing city, which covers Nota Carioca
1.00 files) and NFSE-037 (national `cLocIncid`) compare the stated rate with them.

**Source.** Lei 691/1984 (Código Tributário Municipal) art. 33, caput as worded by Lei 8.467/2024:
the consolidated text on legisweb.com.br (read 2026-11-15), checked item by item against the city's
own table, carioca.rio `Aliquotas-de-ISS-atualizado2025.pdf` (33 items of II; the 2022 version of
the same PDF stops at item 30). legisweb notes that LC 235/2021's general increase (Decreto
49.835/2021) was revoked by Decreto 49.901/2021 before it applied; its § 3 (hospitals, +0.6 points
without proof of investment) stands in the text.

**What art. 33 sets.** I: 5% for everything not in II. II: 33 items, almost all tied to a kind of
service or provider, not to a whole subitem:

| rate | items | read as LC 116 subitems |
|---|---|---|
| 3% | 1 dredging, construction, hydraulic works, consulting engineering, repair of buildings, roads, bridges | 7.01-7.05, 7.17-7.20 (Rio's 7.15-7.18) |
| 3% | 3 advertising carried only on the internet | 17.25 (Rio's 17.24) |
| 3% | 21 logistics for oil and gas | no subitem named: 11.01, 11.04, 16.02, 20.01-20.03 (this tool's reading) |
| 3% | 4 cinema exhibition, until 31 Dec 2022 | not in the years read |
| 0.5% | 7 subitems 7.02 and 7.05 in licensed hotel works | 7.02, 7.05 |
| 2.6% | § 3: item 10's hospitals without the investment | 4.03 |
| 2% | 5 established self-employed professionals and professional partnerships (Lei 3.720/2004); 8 research institutions, junior companies, incubated technology companies | any subitem |
| 2% | the other 23 items (leasing, software to order, 1.09, hospitals, 15.01 funds, securities brokerage, fairs, call centres in named areas, taxi cooperatives, port-area and UFRJ-park services, reinsurance brokerage, seismic data, health-plan administration, franchising, carbon credits, river freight, the exchange's and CCPs' services in items 32-33) | covered by the any-subitem 2% |

So the useful check is narrower than São Paulo's: 2% and 5% are always rates Rio's law sets; 3%,
0.5% and 2.6% only on the subitems above; any other rate (São Paulo's 2.9%, 2.5%, 3.5%, 4%) never.

**The numbering.** Rio's art. 8 list was matched to LC 116's (the planalto.gov.br JSON mirror used
for ABR-024) with difflib on normalised text: the same four shifted runs as São Paulo, all at ratio
1.0 (Rio 3.01-3.04 = LC 3.02-3.05, 7.14-7.20 = 7.16-7.22, 13.01-13.04 = 13.02-13.05, 17.07-17.24 =
17.08-17.25); the other mismatches were ties between identical texts and long texts cut at 200
characters, checked by hand. Art. 33 items 32 and 33 cite Rio's 17.11 and 17.19, which are LC 17.12
(administração em geral) and 17.20 (economic consulting). The table is keyed by LC numbers.

**Corpus.** GitHub code search (`MunicipioIncidencia 3304557`, `cLocIncid 3304557`, `CodigoMunicipio
3304557 Aliquota`, `notacarioca Aliquota`, `3304557 ItemListaServico Aliquota`, `pAliqAplic
3304557`): 49 distinct XML blobs, 48 downloaded to a scratch directory from raw.githubusercontent.com,
read, not copied. 42 name 3304557 anywhere.

| | files |
|---|---|
| name 3304557 | 42 |
| Rio as city of incidence (`cLocIncid`/`MunicipioIncidencia`) | 12: 7 at 5% (1.01, 2.02 twice, 7.01, 10.02, 31.01 twice; one from 2023, one a special regime), 5 with no rate (Simples Nacional DAS files); none flagged |
| of those marked production (`tpAmb` 1) | 3, all at 5%: pass |
| Nota Carioca / ABRASF 1.00 replies issued in Rio, 2009-2018 | 17 (four repositories), at 0.05 and 0.02: outside 2024-2028, said in a note; read without the year limit, all pass |
| flagged | 1, a São Paulo file (2% on LC 1.05, São Paulo's 2.9%), the same verdict as before this change |

False positives on files naming Rio: 0 of 42, a small sample, most of them library samples rather
than issued notes. No Rio rejection was compared.

**Limits.** Item 21 names no subitem; the logistics subitems are a judgment. The 2% items tied to an
area (port, UFRJ park, call-centre areas) cannot be checked from the file and are covered by the
any-subitem 2%. Rio's own CTISS codes (`CodigoTributacaoMunicipio`, Portaria 256/2018 and 321/2025)
are not read. Simples Nacional, MEI, special regimes and ISS not due are not judged, as for São Paulo.

Reproduce: `node eval/iss-city-rates-rio-corpus.mjs <dir>` over the downloaded files.
