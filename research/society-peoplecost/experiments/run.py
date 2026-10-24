"""Seeded (deterministic) experiments for society-peoplecost; writes results.txt next to this file."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_peoplecost import breakeven_lambda, planner_gain, people_cost, reader, yield_all  # noqa: E402

out = []


def p(s=""):
    out.append(s)
    print(s)


R, CN = 0.3, 0.6
RHOS = (1.0, 0.75, 0.5, 0.35, 0.25, 0.1, 0.0)
LAMS = (1, 2, 3, 5)

p("== A. people-only cost, yield-all vs reader fleet (r=0.3, cN=0.6, plain average over people)")
p("# rho yield_all reader gain(positive = fleet helps people)")
Y = yield_all(R)
for rho in RHOS:
    s = reader(R, rho * CN, CN)
    p(f"{rho:.2f} {people_cost(Y):.3f} {people_cost(s):.3f} {planner_gain(R, rho, CN):+.3f}")
p()

p("== B. planner gain over yield-all by rho and urgent weight lam (r=0.3, cN=0.6)")
p("# rho " + " ".join(f"lam={l}" for l in LAMS))
for rho in RHOS:
    p(f"{rho:.2f} " + " ".join(f"{planner_gain(R, rho, CN, l):+.3f}" for l in LAMS))
p()

p("== C. break-even urgent weight (smallest lam at which people-only planner prefers the reader), by rho and cN")
CNS = (0.2, 0.4, 0.6, 0.8, 1.2)
p("# rho " + " ".join(f"cN={c}" for c in CNS))
for rho in RHOS:
    row = []
    for c in CNS:
        b = breakeven_lambda(R, rho, c)
        row.append("never" if b is None else f"{b:.2f}")
    p(f"{rho:.2f} " + " ".join(row))
p()

p("== D. people-only gain (lam=1) by robot share, rho=0.25, cN=0.6")
p("# robots gain_people gain_crowd_with_robots")
for r in (0.1, 0.3, 0.5, 0.7):
    Yr, s = yield_all(r), reader(r, 0.25 * CN, CN)
    p(f"{r:.1f} {planner_gain(r, 0.25, CN):+.3f} {Yr['crowd'] - s['crowd']:+.3f}")
p()

p("== E. largest rho with positive people-only gain (lam=1), cN best of 0.1..1.5, by reading error e")
p("# e rho_max best_cN gain")
grid = [0.1 * i for i in range(1, 16)]
for e in (0.0, 0.1, 0.2):
    best = None
    for rho in [i / 40 for i in range(41)]:
        g, c = max((planner_gain(R, rho, c, 1.0, e), c) for c in grid)
        if g > 0:
            best = (rho, c, g)
    p(f"{e:.1f} " + ("none" if best is None else f"{best[0]:.3f} {best[1]:.1f} {best[2]:+.3f}"))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
