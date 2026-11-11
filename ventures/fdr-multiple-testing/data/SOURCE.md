# Example dataset: the Benjamini & Hochberg (1995) worked example

`bh1995.csv` holds the 15 p-values of the worked example in:

> Yoav Benjamini and Yosef Hochberg (1995). "Controlling the False Discovery
> Rate: A Practical and Powerful Approach to Multiple Testing". *Journal of
> the Royal Statistical Society, Series B* 57(1), 289-300.
> doi:10.1111/j.2517-6161.1995.tb02031.x

Benjamini, Krieger & Yekutieli (2006, *Biometrika* 93(3)) reuse the same 15
values to illustrate their two-stage procedure.

- **Where the values were read:** `statsmodels/stats/tests/test_multi.py` in
  statsmodels 0.15.0 (BSD-3-Clause), functions `test_fdr_bky` and
  `test_fdr_twostage`, which list them with the comment "example from BKY"
  and pin "single step-up: 4, two-stage: 8, iterated two-step: 9"
  rejections at 0.05 and a second-stage level of 0.0649. This tool's tests
  reproduce 4, 8 and 0.0649.
- **Not read directly:** the 1995 and 2006 papers. A PDF host for the 1995
  paper was refused by this session's network proxy, so the values were not
  checked against the printed table in this session.
- **Retrieved:** 2026-11-11.
- **Changes:** one value per row, sorted as listed, with a label column
  `H1` ... `H15` added by this repository (the labels are rank order, not
  the paper's names for the hypotheses). 15 rows plus a header.
- **SHA-256 of `bh1995.csv`:** `8c9cb7c1fc866add3c4335dca8007580b24c24e2d5a50d13577bd80417f2c39a`
- **Licence:** published numbers (facts), reproduced with citation. Cite
  Benjamini & Hochberg (1995) when you use them.

The data contain no names or identifiers.
