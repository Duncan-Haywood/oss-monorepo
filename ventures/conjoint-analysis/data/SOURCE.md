# Example data

`meal-kit-simulated.csv` is **simulated**, not real survey answers: no public,
freely licensed set of real choice-based conjoint answers was found to bundle.
Being simulated is what makes it a test, because the true utilities are known.

- Made by `node simulate.mjs > data/meal-kit-simulated.csv` (the page's example
  button calls the same `simulate()` and gets this exact file; `page.test.mjs`
  checks).
- Design: `generateDesign()` with seed 1, 10 versions, 12 tasks, 3 concepts plus
  a "none" option, attributes in `meal-kit-levels.txt`.
- 300 respondents (respondent r answers version r mod 10). Each respondent's
  utilities are drawn from normal distributions around the means in
  `simulate.mjs` (`TRUE_MEAN`), with standard deviation 0.15 on the price
  slope, 1.0 on the none constant and 0.5 on every other level (`TRUE_SD`);
  each choice adds Gumbel noise, so the individual model is a logit and the
  population is a mixed logit.
- Price per serving is in US dollars; the levels and utilities are invented and
  describe no real company or market.

`eval/cases/` holds three more simulated studies (`eval/cases.mjs`) used only
for the statsmodels reference.
