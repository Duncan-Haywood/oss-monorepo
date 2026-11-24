# Mix calibration methods on synthetic cubes, 2026-11-24

`node eval/annex-methods.mjs 200` (about 75 minutes on one core); raw numbers in
`annex-methods-2026-11-24.json`, progress lines in `.log`.

**Set-up.** Synthetic mortar cubes, not lab data: a mix whose rate constant
follows Arrhenius with E = 42,000 J/mol (k = 0.02 /h at 23 °C), Su = 6,000 psi,
final setting at 0.12/k hours, cured at 10, 23 and 38 °C, broken at 2, 4, 8,
16, 32 and 64 times final setting, three cubes per age (54 cubes). Each cube's
strength gets independent multiplicative Gaussian noise with coefficient of
variation 3%, 6% or 10%. 200 seeded data sets per noise level, each run with the
measured setting times given and without them. Three estimators
(`calibrate.mjs`):

- *1/S line*: the annex's straight line through 1/S against 1/(t - t0) per
  temperature, k = intercept/slope (t0 = 0 when setting is not given).
- *Hyperbola*: least squares on the strengths per temperature (t0 fitted when
  not given).
- *Single curve*: no per-temperature k; the E (or datum) that minimises the
  scatter of all 54 cubes about one hyperbolic strength-maturity curve.

**Activation energy, 90% of estimates fell in (kJ/mol, truth 42.0):**

| noise CV | setting times | 1/S line | hyperbola | single curve |
|---|---|---|---|---|
| 3% | given | 39.8-44.8 | 39.6-44.4 | 41.0-43.1 |
| 3% | not given | 37.8-47.4 | 38.4-46.2 | 41.0-43.1 |
| 6% | given | 37.0-46.2 | 37.5-47.3 | 40.0-44.0 |
| 6% | not given | 31.9-50.7 | 35.0-50.3 | 40.0-44.0 |
| 10% | given | 34.0-51.9 | 34.4-50.9 | 38.4-45.0 |
| 10% | not given | 26.1-64.2 | 29.8-55.2 | 38.4-45.0 |

Standard deviations: single curve 623 / 1,199 / 2,027 J/mol at 3 / 6 / 10%;
the two per-temperature methods 1,500 to 11,500. All three are close to
unbiased (means 41.4 to 42.7 kJ/mol). The single curve does not use setting
times, so its row is the same with or without them.

**Datum temperature (Nurse-Saul).** An Arrhenius mix has no true datum: k is
not linear in T. The k-line datum averaged 4.3 to 4.7 °C (2.8 to 4.6 without
setting times), the single-curve datum 2.0 to 2.1 °C. Scatter of all cubes
about one curve, mean RMSE in psi:

| noise CV | datum 0 °C default | k-line datum | single-curve datum |
|---|---|---|---|
| 3% | 210 | 260 | 183 |
| 6% | 275 | 339 | 254 |
| 10% | 388 | 457 | 373 |

(setting times given; without them the k-line column is 264 / 364 / 495.)
So on this mix the annex's datum collapses the cubes *worse* than the 0 °C
default, at every noise level. The reason is the straight line through three
points of a convex k(T): the hot point pulls the intercept up.

**What this does and does not show.** It shows the estimators' behaviour when
the hyperbola-with-Arrhenius-rate model is true and noise is independent per
cube. It does not show behaviour on real cubes (batch-to-batch shifts between
temperature sets, a rate that is not Arrhenius, specimen moisture), which
needs a real three-temperature cube sheet: the next step in README "Next".

**What shipped because of it.** The page and CLI show the annex values (the
procedure people are asked to follow) with the single-curve values next to
them, and a table of the scatter about one curve under each, so a user sees
when the annex's datum is the worse choice.
