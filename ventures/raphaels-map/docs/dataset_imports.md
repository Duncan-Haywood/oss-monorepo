# Importing the registration-gated surveys

Raphael's Map leaves every values-survey cell for other countries empty
(`null`, flagged `not_ingested`, source status `gated`) until you import a
survey file yourself. These surveys are free for research, but each publisher
asks you to register and accept its terms before downloading. We cannot fetch
them for you, and we cannot put them in this repository.

This guide covers: where to register, which file to download, how to run the
importer, where the output goes, and why the microdata must never be committed.

## Before you start

- Python 3 with `pandas`, `numpy`, `scipy` and `pyyaml` (`pip install pandas numpy scipy pyyaml`).
  For SPSS `.sav` files you also need `pyreadstat`; the Stata `.dta` version needs nothing extra.
- Pick a private folder **outside this repository** for the downloads and the
  outputs, for example `~/raphaels-map-private/`. The importer prints a warning
  if the input file sits inside the git work tree and is not ignored.

## 1. Register and download

Use the official landing pages only (SPEC §4):

| Dataset | Landing page | What to download | Importer |
|---|---|---|---|
| ISSP 2022, Family and Changing Gender Roles V | <https://www.gesis.org/en/issp/data-and-documentation/family-and-changing-gender-roles/2022> | The integrated data file (GESIS study ZA10000 or the number the page gives) in **Stata (.dta)** format, plus its codebook / variable report (PDF). | `pipeline/import_issp.py` |
| ISSP family module, earlier waves | <https://www.gesis.org/en/issp/data-and-documentation/family-and-changing-gender-roles> | Historical comparisons only (1988, 1994, 2002, 2012). | none yet |
| Joint EVS/WVS 2017–2022 | <https://www.gesis.org/en/european-values-study/data-and-documentation/joint-evs/wvs-2017-2022-dataset> (also offered at <https://www.worldvaluessurvey.org/WVSEVSjoint2017.jsp>) | The joint dataset (GESIS ZA7505 or the number shown) in **Stata (.dta)** format, plus the variable report / codebook. | `pipeline/import_wvs_evs.py` |
| Latinobarómetro 2024 | <https://www.latinobarometro.org/latinobarometro-2024> | Data file and 2024 questionnaire. | none yet |
| Demographic and Health Surveys | <https://dhsprogram.com/data/> | Needs an account and a project approval per country. Individual recode for each country wave. | none yet |

On GESIS you create a free account, then the download page asks you to
state your purpose and accept the terms of use. Record the exact **version and
DOI** shown on the page; you will cite it.

If the download is a `.zip`, unzip it first. The importers read `.dta` and
`.sav`.

## 2. Check the variable mapping against the codebook

The importers were written without access to the files. Every variable name,
code and label pattern in the mapping was written from general knowledge of
how these surveys are laid out, and is marked `confirm_against_codebook: true`:

- ISSP: `pipeline/importers/issp2022.yaml`
- EVS/WVS: `pipeline/importers/evs_wvs_2017_2022.yaml`

Open the codebook next to the YAML and, for each entry:

1. Check the `variable` name exists and is the item you mean (ISSP numbers
   substantive items `v1`, `v2`, … and the order in our file is a guess).
2. Copy the exact English source question into `original_text`.
3. Check the weight variable is the one the documentation recommends for
   single-country analysis. Our mappings assume `WEIGHT` (ISSP) and `gwght`
   (EVS/WVS, rather than the population-size weight `pwght` meant for
   pooling); both are guesses to confirm.
4. Check each `levels` / `categories` pattern (regular expressions matched
   against the file's value labels) and each `expect_labels` code.
5. Delete any question the survey did not ask (for example the ISSP "ideal
   number of children" entry, which may not be in the 2022 wave).
6. If the file has stratum and PSU variables, add
   `design_variables: {strata: <name>, psu: <name>}` to get design-based
   intervals; otherwise intervals are labelled approximate (`approx_ci`).
7. Set `confirm_against_codebook: false` on the entry.

The importer **refuses to run** while any entry still says `true`. Once you
have checked them all, you may instead pass `--i-checked-the-codebook`.

Even then, the importer checks the file itself before writing anything: each
mapped variable must exist, each label pattern must match at least one value
label, and each `expect_labels` code must carry the expected label. If not,
it stops with a message naming the variable and listing the labels the file
actually has. No output is written on failure.

## 3. Run the importer

From the repository root:

```
python3 -I ventures/raphaels-map/pipeline/import_issp.py \
  --file ~/raphaels-map-private/ZA10000_v1-0-0.dta \
  --out  ~/raphaels-map-private/surveys

python3 -I ventures/raphaels-map/pipeline/import_wvs_evs.py \
  --file ~/raphaels-map-private/EVS_WVS_Joint_Stata_v5_0.dta \
  --out  ~/raphaels-map-private/surveys
```

(Use your file's real name. `--mapping PATH` points at an edited copy of the
YAML if you keep one elsewhere.)

## 4. What comes out

`<out>/issp2022/` or `<out>/evs_wvs_2017_2022/`, each with:

- `crosstabs.json`: the `data/surveys/crosstabs.json` table shape
  (`ARCHITECTURE.md`): one table per country × sex × age band × religion ×
  attendance × marital status (each also "any") × question, with weighted
  percentages and 95% intervals, `n`, `n_eff = (Σw)² / Σw²`, the weighted base,
  excluded don't-know / refused / not-applicable counts, and flags.
- `questions.json`: the dataset entry (weight variable, years) and each
  question's original text, the file's value labels and the codes in each
  reported category.

Rules the output follows (SPEC §6.2):

- Countries are never pooled; each table is one national survey.
- `n_eff < 30`: `rows` is `null` and the table is flagged
  `suppressed_small_sample` ("Insufficient sample"), never 0%.
- `30 ≤ n_eff < 100`: flagged `exploratory_sample`.
- Don't-know, refusals and not-applicable answers are excluded from the
  denominator and counted under `excluded`.

The statistics come from `pipeline/survey_stats.py`, the same helper the U.S.
survey build uses.

## 5. Why the files must never be committed

- **Licensing.** GESIS, the EVS/WVS, Latinobarómetro and the DHS Program let
  registered users analyse their data but forbid passing respondent-level
  files to anyone else. This repository is public; committing a file would
  redistribute it to everyone.
- **Privacy.** Even without names, respondent records hold religion, politics
  and family details. The product only ever publishes aggregates.
- **Honesty about numbers.** The aggregates you produce come from a mapping you
  checked. Before you share them, check the publisher's terms on publishing
  results (they usually ask for a citation of the exact dataset version) and
  keep the citation with the numbers.

Keep the microdata and the outputs in your private folder. If you ever see a
`.dta`, `.sav` or `.por` file in `git status`, do not add it.

## What the page shows until then

`data/intl/countries.json` lists, for each country, `values_issp2022`,
`values_evs_wvs_2017_2022`, `values_latinobarometro2024` and `values_dhs` as
`{"e": null, "flags": ["not_ingested"], "source_status": "gated"}`, and the
country groups (by which public sources cover each country) carry
`values_evidence: null`. There is no global country score.
