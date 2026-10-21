"""Run every experiment; writes experiments/results.txt.   PYTHONPATH=src python experiments/run.py"""
from pathlib import Path
from infra_yield import *

OUT = []


def p(s=""):
    OUT.append(s)


W7, W5 = 9346.0, 16988.0   # CSET (2020) estimated TSMC 300 mm wafer prices, USD
D7, D5 = 0.09, 0.11        # AnandTech (Cutress, Aug 2020) quoting TSMC: N7 ~0.09, N5 ~0.10-0.11 /cm2

p("A. Yield against A*D0, five models (alpha=3 and n=10 are assumed)")
p("x poisson murphy seeds bose10 negbin3")
for x in [0.1, 0.25, 0.5, 1, 2, 3, 5]:
    p(f"{x} {poisson(x):.4f} {murphy(x):.4f} {seeds(x):.4f} {bose_einstein(x):.4f} {neg_binomial(x):.4f}")

p()
p("B. Dies per wafer, 300 mm, 3 mm edge: closed form against exact grid count (square dies)")
p("area_mm2 closed exact diff_pct")
for a in [25, 100, 200, 400, 600, 800]:
    s = a ** 0.5
    e = dies_per_wafer_exact(s, s)
    c = dies_per_wafer(a)
    p(f"{a} {c} {e} {100 * (c - e) / e:.1f}")

p()
p("C. Cost per good die, USD, negative binomial alpha=3 (wafer price and D0 from the sources above)")
p("area_mm2 dpw yield7 cost7 yield5 cost5 ratio5to7")
for a in [50, 100, 200, 300, 400, 600, 800]:
    n = dies_per_wafer(a)
    y7 = neg_binomial(a / 100 * D7)
    y5 = neg_binomial(a / 100 * D5)
    c7 = good_die_cost(a, W7, D7)
    c5 = good_die_cost(a, W5, D5)
    p(f"{a} {n} {y7:.3f} {c7:.0f} {y5:.3f} {c5:.0f} {c5 / c7:.2f}")

p()
p("D. The 600 mm2 die: cost by yield model (CSET quotes about $233 at 7nm and $238 at 5nm for a die of about this size)")
p("model cost7 cost5")
for m in MODELS:
    p(f"{m} {good_die_cost(600, W7, D7, m):.0f} {good_die_cost(600, W5, D5, m):.0f}")
for al in [1, 2, 5, 10]:
    p(f"negbin_alpha{al} {good_die_cost(600, W7, D7, 'neg_binomial', alpha=al):.0f} {good_die_cost(600, W5, D5, 'neg_binomial', alpha=al):.0f}")

p()
p("E. Chiplet break-even: smallest logic area (mm2) where n chiplets beat one die (N5 wafer, 10% die-to-die overhead, 99% bond yield)")
p("d0 pkg bond n2 n4")
for d0 in [0.05, 0.11, 0.2, 0.3]:
    for pkg, bond in [(10, 2), (30, 5), (60, 10), (120, 20)]:
        r = []
        for n in (2, 4):
            a = breakeven_area(n, W5, d0, pkg=pkg, bond=bond)
            r.append("none" if a is None else f"{a:.0f}")
        p(f"{d0} {pkg} {bond} {r[0]} {r[1]}")

p()
p("F. Chiplet cost at 800 mm2 logic, N5 wafer, D0 0.11, pkg 30 bond 5 (cost USD per assembled part)")
p("n cost")
for n in (1, 2, 3, 4, 6, 8):
    p(f"{n} {chiplet_cost(800, n, W5, 0.11, pkg=30, bond=5):.0f}")

p()
p("G. Does the break-even depend on the yield model? (N5, D0 0.11, pkg 30 bond 5, n=2)")
p("model breakeven_mm2")
for m in MODELS:
    a = breakeven_area(2, W5, 0.11, pkg=30, bond=5, model=m)
    p(f"{m} {'none' if a is None else round(a)}")

Path(__file__).with_name("results.txt").write_text("\n".join(OUT) + "\n")
print("\n".join(OUT))
