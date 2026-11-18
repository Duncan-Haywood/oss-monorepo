# Example data

`schooling-simulated.csv` is simulated, not observed. It has 3,000 rows (20
people in each of 150 counties) drawn by `eval/simulate.py` (numpy PCG64,
seed 20261118), generated 2026-11-18. No data from any survey, study or
package are included. The story borrows the shape of the college-proximity
design (Card 1995) but none of its data.

- County traits: `college_nearby` Bernoulli(0.45), `tuition` (public tuition,
  $ thousand a year) uniform on 2-9, `urban` Bernoulli(0.6), `south`
  Bernoulli(0.35), and an unrecorded county wage shock N(0, 0.10^2).
- People: `black` Bernoulli(0.15), `experience` uniform on 1-25 years
  (`experience_sq` its square), and an unrecorded ability N(0, 1).
- Schooling (`education_years`) = round(12.6 + 0.9 ability + 0.7 nearby -
  0.18 (tuition - 5.5) - 0.5 black + 0.4 urban - 0.3 south + N(0, 1.6^2)),
  clipped to 8-20.
- `log_wage` = 1.1 + **0.08** schooling + 0.045 exper - 0.0008 exper^2 - 0.14
  black - 0.09 south + 0.15 urban + 0.12 ability + county shock + N(0, 1) x
  (0.28 + 0.008 exper). Errors are heteroskedastic and correlated within a
  county.

The instruments are valid by construction: `college_nearby` and `tuition`
affect wages only through schooling, and the county shock is independent of
them. Ability is left out of the file, so OLS is biased upwards.

What the script printed for this draw: corr(schooling, ability) 0.4306;
mean schooling 12.912 (range 8 to 19); 64 of 150 counties with a college
nearby; true return 0.08.
