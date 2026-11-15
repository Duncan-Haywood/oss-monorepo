# Example data: GoEmotions sentiment labels

`goemotions-sentiment.csv` holds 1,200 rows (1,173 ratings and 27 blanks) by 75
raters of 300 Reddit comments, one row per rater per comment:
`comment_id,rater_id,sentiment`.

- **Source:** the GoEmotions raw annotation files, Demszky, Movshovitz-Attias,
  Ko, Cowen, Nemade & Ravi (2020), "GoEmotions: A Dataset of Fine-Grained
  Emotions", ACL 2020, https://arxiv.org/abs/2005.00547, doi:10.18653/v1/2020.acl-main.372.
  Files: `https://storage.googleapis.com/gresearch/goemotions/data/full_dataset/goemotions_{1,2,3}.csv`
  and the group map `goemotions/data/sentiment_mapping.json` in
  https://github.com/google-research/google-research.
- **Licence:** Apache License 2.0 (the google-research repository's licence,
  which the dataset card on Hugging Face, `google-research-datasets/go_emotions`,
  names as the dataset's licence). Apache-2.0 allows redistribution and
  modification with attribution; this file is a modified extract, and the
  change is described below.
- **Retrieved:** 2026-11-15.
- **SHA-256 of the inputs:**
  - `goemotions_1.csv` `cac049036bad5d68d1081f72b65f2cc51e4df82af05e3e22cfa747051cac1af3`
  - `goemotions_2.csv` `f699ecc5aa425c1720c1d02475f1e41815244b680bd75b282eb770d2c76cd84d`
  - `goemotions_3.csv` `467f1e7191af00f2e76cc7f425885c2dc304bea8aff284b10e8c460d22f2e1af`
  - `sentiment_mapping.json` `801f6f028082141bd38541a4b14d65b33bdc55d29c7b2aaa029fefecf206f76b`
  - output `goemotions-sentiment.csv` `e30c9e0859ff4da88452ea880fdb51b8d67f30b2f866033677e06684f004c717`

## What was changed

`build_example.py` (in this folder, standard library only) keeps the first 300
comments, in the order they first appear in `goemotions_1.csv`, that at least
three raters labelled across the three files, and reduces each rater's 28
emotion ticks to one sentiment with the dataset's own `sentiment_mapping.json`
groups:

| The rater ticked | Sentiment |
| --- | --- |
| only `neutral` | neutral |
| emotions all in one group | positive, negative or ambiguous |
| emotions from two or more groups, or `neutral` plus an emotion | mixed |
| nothing, or marked the comment "very unclear" | blank (missing) |

The comment text is not copied. The comment id links each row back to the
source files.

GoEmotions' raters were not assigned in a fixed design: each comment was
labelled by a different subset of 82 raters, so rater-level views (alpha
without one rater) are about raters who share few comments. The GoEmotions
paper reports its own agreement analysis on the full 28 labels; this extract
only illustrates the tool.

## Test-only reference data (in `eval/reference.py`, not in this folder)

- Krippendorff, K. (2011), "Computing Krippendorff's alpha-reliability",
  section C: 4 observers x 12 units, values 1-5 with missing data, published
  alphas 0.743 (nominal), 0.815 (ordinal), 0.849 (interval), 0.797 (ratio).
- Shrout, P. E. & Fleiss, J. L. (1979), Table 2: 6 targets x 4 judges, with the
  six ICCs of their Table 4.

Both are small published tables of numbers, reproduced with citation to check
the engine against the papers' own results.
