import os, sys
here = os.path.dirname(__file__)
for p in ("../src", "../../osrobot-uavnogo/src", "../../osrobot-uavgust/src", "../../osrobot-uavwind/src", "../../osrobot-uav/src"):
    sys.path.insert(0, os.path.join(here, p))
from osrobot_uavvalue.value import net_value, best_rule
from osrobot_uavgust.gust import wind_pmf, quantile
from osrobot_uavwind.wind import WindMission

out = []
def pr(s):
    print(s); out.append(s)
ms = WindMission(3000, 1200, 0.5)
C_SCRUB, N = 10.0, 100  # assumed: $ per scrubbed day, attempts the airframe price is spread over
GRID = [3.0 + i for i in range(14)]  # 3 .. 16 m/s
pr("# Value-optimal (design limit L, launch threshold T); mission 3 km, 20 min, 0.5 kg; wind ~ Normal(mu, sigma); forecast error sf m/s")
pr(f"# assumed: P = airframe $/kg (lost on a failure), ${C_SCRUB:.0f} per scrubbed day, price spread over {N} attempts; V = value of a completed observation ($)")
pr("# columns: mu sigma kind P sf V | best: L T net P_scrub P_fail P_done mass | tied (T=L): L net | design-to-q95-always-launch: net | gain_free_vs_q95 gain_free_vs_tied")
for mu, sigma, kind in [(5, 4, "fw"), (5, 4, "mr"), (8, 3, "fw")]:
    pmf = wind_pmf(mu, sigma)
    for P in (1500.0, 30000.0):
        for V in (50, 200, 1000):
            for sf in (0, 2):
                v, L, T, (sc, fl, dn, m) = best_rule(kind, ms, pmf, GRID, sf, V, P, C_SCRUB, N)
                vt, Lt, _, _ = best_rule(kind, ms, pmf, GRID, sf, V, P, C_SCRUB, N, tied=True)
                L95 = quantile(pmf, 0.95)
                v95, _ = net_value(kind, ms, pmf, L95, 1e9, sf, V, P, C_SCRUB, N)
                pr(f"{mu} {sigma} {kind} {P:.0f} {sf} {V} | {L:.1f} {T:.1f} {v:.2f} {sc:.3f} {fl:.3f} {dn:.3f} {m:.3f} | {Lt:.1f} {vt:.2f} | {v95:.2f} | {v-v95:.2f} {v-vt:.2f}")
with open(os.path.join(here, "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
