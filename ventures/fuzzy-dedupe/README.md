# Fuzzy Dedupe

A free tool for anyone cleaning a contact list, CRM export, customer or donor file: **find the duplicate rows an
exact match misses** (Bob and Robert, Raman and Ramen, a Gmail address with and without dots, Inc and LLC, first and
last name swapped), see why each pair matched, and download a merged CSV with one row per person. Runs in the
browser, from the command line or from an AI agent. Nothing is uploaded.

**Live tool:** https://marisstella.app/fuzzy-dedupe/

After using this, you can **merge two contact lists, or clean one before an import or a mail-out, without sending the
same person three emails or paying a CRM for three contacts**, and you know which merges to check by eye.

## What it does

- **Blocking.** Only rows that share a key are compared: the same email, the same last 7 phone digits, an ID number,
  Soundex of the surname with the first initial, the first letters of a name with the postcode or birth date, the
  street and number, the company with the first initial, and first/last swapped. On Febrl 2 that is 16,680 of 12.5 million pairs (0.13%).
- **Graded comparison per field** (`LEVELS` in `engine.mjs`): names with accents dropped and about 60 English nickname
  groups joined, then Jaro-Winkler (exact / >= 0.92 / >= 0.80 / initial only / different); emails with case, Gmail dots
  and `+tags` ignored (exact / same name before @ / one typo / different); phones on their last 10 digits; companies
  without Inc, LLC, Ltd and friends; streets with St/Street joined; dates with one typo or day and month swapped; ID
  numbers and postcodes with one typo.
- **Weights learned from the file** (Fellegi and Sunter 1969; Winkler 1988): EM on the candidate pairs fits m (how often
  duplicates agree at each level), u (how often non-duplicates in the candidate set do) and the match share. The weight
  of a level is log2(m/u); a pair's weights and the prior add up to its match probability.
- **Groups** are the connected components of pairs at or above the threshold (default 90%). Pairs between 50% and the
  threshold are listed as borderline. A group of more than 10 rows is called out, because a chain of near matches can
  join different people.
- **Colleague and family guard** (on by default): a pair with clearly different first names is held for review, not
  merged, unless an email, phone, ID number or date also agrees exactly. See "Measured" for what it costs.
- **Merge:** the row with the most filled cells is kept and its blanks are filled with the group's most common value;
  columns where the group disagrees are named. Downloads: the input with `duplicate_group`, `group_size`, `keep`,
  `best_match_row`, `match_probability` columns, and a merged file with `merged_from_rows`. Cells that a spreadsheet
  would run as a formula are prefixed with `'`.

## Measured

`node eval/febrl.mjs <dir with dataset2.csv and dataset3.csv>` (the recordlinkage 0.16 wheel's `datasets/febrl`;
Febrl 1 is in `data/`). Pairwise precision / recall / F1 of the groups against the true groups; output in
`eval/febrl-2026-11-13.txt`. The baseline is exact match on first name, last name and postcode.

| Set | Rows | True pairs | Tool at 90% | Exact match |
| --- | ---: | ---: | --- | --- |
| Febrl 1 | 1,000 | 500 | 1.000 / 0.998 / 0.999 | 1.000 / 0.362 / 0.532 |
| Febrl 2 | 5,000 | 1,934 | 1.000 / 0.996 / 0.998 | 1.000 / 0.291 / 0.451 |
| Febrl 3 | 5,000 | 6,538 | 1.000 / 0.998 / 0.999 | 1.000 / 0.259 / 0.412 |

With only name and address columns (birth date and ID number set to ignore), the guard on / off:

| Set | Guard on | Held for review | Guard off |
| --- | --- | ---: | --- |
| Febrl 1 | 1.000 / 0.848 / 0.918 | 54 | 1.000 / 0.956 / 0.978 |
| Febrl 2 | 1.000 / 0.835 / 0.910 | 217 | 1.000 / 0.966 / 0.983 |
| Febrl 3 | 0.997 / 0.810 / 0.894 | 799 | 0.998 / 0.952 / 0.974 |

Febrl's corruption often damages the first name, and its files have no colleagues or relatives sharing a surname and
address, so the guard costs recall here and buys nothing. It is on by default because a business contact list is the
opposite case: on the page's contact example, without it, Grace Whitfield merges into James Whitfield's group (same
surname, company, town and ZIP, nothing else shared). That is an illustration, not a measurement; a labelled
contact list with colleagues in it is the test this still needs.

Two designs were tried and dropped, both measured:

- **u held fixed at the random-pair estimate** (Splink's default). On Febrl 2 with name and address only, EM pushed
  the match share to 0.999 and one group swallowed 4,210 of 5,000 rows: pairs that share a blocking key agree on
  postcode or street far more often than random pairs, and the only class that could explain them was "match". Fitting
  u by EM as well (Winkler's original form, started from the random-pair u) fixed it.
- **The match share learned on a tiny file.** On the 21-row contact example EM sees 12 candidate pairs and pushes the
  share to its bound, so any shared block becomes a match. Under 300 candidate pairs u stays at the random-pair
  estimate and the prior is capped at even odds (`minLearnPairs`).

Runtime: Febrl 2 and 3 (5,000 rows) take 0.3 to 0.6 s in Node on this container.

## Verification

- `engine.test.mjs`: Jaro and Jaro-Winkler against the published worked examples (MARTHA/MARHTA 0.944/0.961,
  DWAYNE/DUANE 0.822/0.840, DIXON/DICKSONX 0.767/0.813); symmetry and range on 2,000 random pairs; Soundex codes
  (R163, A261, T522, P236); EM recovers known m, u and match share (0.3) within 0.03 on 20,000 simulated vectors;
  Febrl 1 recall >= 0.998 at precision 1 and the exact-match baseline 0.362; the contact example's eight groups and
  four held pairs; merge and annotated CSVs; row-order invariance (>99.5% of groups identical when rows are reversed);
  error messages.
- `cli.test.mjs`, `page.test.mjs` (disclaimer, citation, no network calls, the page's benchmark figures equal the eval
  output), `usage.test.mjs`.
- Headless Chromium at 390 px: both examples run, no console errors, no horizontal scroll; the Febrl example reports
  499 of 500 true pairs found and 0 wrong against its `rec_id` column.

## Method and citation

- Fellegi, I. P. and Sunter, A. B. (1969). A Theory for Record Linkage. *JASA* 64(328), 1183-1210. doi:10.1080/01621459.1969.10501049
- Winkler, W. E. (1988). Using the EM Algorithm for Weight Computation in the Fellegi-Sunter Model of Record Linkage.
  *Proceedings of the Section on Survey Research Methods, ASA*, 667-671.
- Jaro, M. A. (1989). Advances in Record-Linkage Methodology as Applied to Matching the 1985 Census of Tampa, Florida.
  *JASA* 84(406), 414-420. doi:10.1080/01621459.1989.10478785
- Winkler, W. E. (1990). String Comparator Metrics and Enhanced Decision Rules in the Fellegi-Sunter Model of Record
  Linkage. *Proceedings of the Section on Survey Research Methods, ASA*, 354-359.

Written from the papers' mathematics; no code was ported. Deviations are listed in `PAPERS` (`node
../../platform/agents/tools.mjs describe fuzzy-dedupe`). Example data: `data/SOURCE.md`.

## Model and limits

- Conditional independence: fields are assumed to agree independently given match status. Company, town and postcode
  are correlated in practice, which is why the guard exists.
- u comes from the file, not a population: a surname that is rare nationally but common in your file counts for little.
  No term-frequency adjustment yet.
- Nicknames are English only; no transliteration across scripts.
- Up to 50,000 rows; blocks of more than 400 rows on one key are skipped (counted in the result).
- Not modelled: which of two conflicting values is current, matching two files against each other as separate
  sources, households.

## Run

Open `index.html` through any static server. CLI: `node cli.mjs contacts.csv --merged clean.csv`. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** Keep a copy of the original file.
To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`dedupe_run`, `example_loaded`, `merged_downloaded`,
`annotated_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
