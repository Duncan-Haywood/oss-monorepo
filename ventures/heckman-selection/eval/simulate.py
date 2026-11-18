"""Draw data/wages-simulated.csv: 2,000 simulated women, of whom only those in
paid work have an observed wage. numpy PCG64, seed 20261118. No real data."""
import numpy as np
from pathlib import Path

SEED, N = 20261118, 2000
RHO, SIGMA = 0.6, 0.45
rng = np.random.Generator(np.random.PCG64(SEED))

county = rng.integers(1, 81, N)                       # 80 counties, no county effect
educ = np.clip(np.round(rng.normal(12.8, 2.3, N)), 8, 20)
exper = np.clip(np.round(rng.uniform(0, 30, N)), 0, 30)
kids_under6 = np.clip(rng.poisson(0.35, N), 0, 3)
kids_6_18 = np.clip(rng.poisson(0.9, N), 0, 5)
other_income = np.round(np.exp(rng.normal(np.log(35) + 0.03 * (educ - 12.8), 0.6, N)), 1)  # $ thousand a year
regions = np.array(["midwest", "northeast", "south", "west"])
region = regions[rng.integers(0, 4, N)]
region_wage = {"midwest": 0.0, "northeast": 0.08, "south": -0.06, "west": 0.05}

# (u, e) bivariate normal: var(u) = 1, var(e) = SIGMA^2, corr RHO
z1, z2 = rng.standard_normal(N), rng.standard_normal(N)
u = z1
e = SIGMA * (RHO * z1 + np.sqrt(1 - RHO**2) * z2)

s_star = (0.35 + 0.13 * (educ - 12) + 0.05 * exper - 0.0012 * exper**2
          - 0.85 * kids_under6 - 0.15 * kids_6_18 - 0.012 * (other_income - 35) + u)
works = (s_star > 0).astype(int)
log_wage = (1.0 + 0.085 * educ + 0.035 * exper - 0.0006 * exper**2
            + np.array([region_wage[r] for r in region]) + e)

lines = ["person,county,works,log_wage,educ,exper,exper_sq,kids_under6,kids_6_18,other_income,region"]
for i in range(N):
    w = f"{log_wage[i]:.4f}" if works[i] else ""
    lines.append(f"{i + 1},{county[i]},{works[i]},{w},{int(educ[i])},{int(exper[i])},{int(exper[i]**2)},"
                 f"{kids_under6[i]},{kids_6_18[i]},{other_income[i]:.1f},{region[i]}")
out = Path(__file__).resolve().parent.parent / "data" / "wages-simulated.csv"
out.write_text("\n".join(lines) + "\n")

# What this draw looks like, for data/SOURCE.md
X = np.column_stack([np.ones(N), educ, exper, exper**2])[works == 1]
b = np.linalg.lstsq(X, log_wage[works == 1] - np.array([region_wage[r] for r in region])[works == 1], rcond=None)[0]
print(f"rows {N}; working {works.sum()} ({works.mean():.4f}); mean educ {educ.mean():.3f};"
      f" mean kids_under6 {kids_under6.mean():.3f}; corr(u, e) sample {np.corrcoef(u, e)[0, 1]:.4f};"
      f" OLS educ on workers (true region effects removed) {b[1]:.4f}; true 0.085")
