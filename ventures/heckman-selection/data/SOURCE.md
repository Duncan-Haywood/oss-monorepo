# Example data

`wages-simulated.csv` is simulated, not observed. It has 2,000 rows drawn by
`eval/simulate.py` (numpy PCG64, seed 20261118), generated 2026-11-18. No data
from any survey, study or package are included. The story borrows the shape of
the classic married-women's labour supply setting (Heckman 1974; Mroz 1987)
but none of its data.

- `educ` = round(N(12.8, 2.3^2)) clipped to 8-20; `exper` = round(uniform
  0-30) years (`exper_sq` its square); `kids_under6` Poisson(0.35) capped at
  3; `kids_6_18` Poisson(0.9) capped at 5; `other_income` (household income
  other than her own, $ thousand a year) = exp(N(log 35 + 0.03 (educ - 12.8),
  0.6^2)); `region` one of four, uniformly; `county` 1-80 uniformly, with no
  effect (it is there to try clustered errors).
- (u, e) bivariate normal, var(u) = 1, sd(e) = 0.45, corr **0.6**.
- `works` = 1 when 0.35 + 0.13 (educ - 12) + 0.05 exper - 0.0012 exper^2 -
  0.85 kids_under6 - 0.15 kids_6_18 - 0.012 (other_income - 35) + u > 0.
- `log_wage` = 1.0 + **0.085** educ + 0.035 exper - 0.0006 exper^2 + region
  effect (midwest 0, northeast 0.08, south -0.06, west 0.05) + e, recorded
  only when `works` = 1 (blank otherwise).

The children and other-income variables affect wages only through whether she
works, by construction, so they are valid exclusion restrictions here.

What the script printed for this draw: 1,213 of 2,000 working (60.65%); mean
educ 12.831; mean kids_under6 0.361; sample corr(u, e) 0.6013; OLS of log
wage on educ, exper and exper^2 among workers (true region effects removed)
gives 0.0743 for educ against the true 0.085.
