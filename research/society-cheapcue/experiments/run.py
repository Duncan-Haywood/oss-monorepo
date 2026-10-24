"""Seeded experiments for society-cheapcue; writes results.txt next to this file."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_cheapcue import reader, yield_all  # noqa: E402

out = []


def p(s=""):
    out.append(s)
    print(s)


R = 0.3
RHOS = (1.0, 0.75, 0.5, 0.35, 0.25, 0.1, 0.0)
CNS = (0.2, 0.4, 0.6, 0.8, 1.2)
Y = yield_all(R)

p("== A. yield-all baseline (r=0.3, u=0.2, wu=3, k=3, d=1; nobody signals)")
p("# urgent normal robots crowd")
p(f"{Y['cU']:.3f} {Y['cN']:.3f} {Y['cR']:.3f} {Y['crowd']:.3f}")
p()

p("== B. reader fleet, cN=0.6, urgent cost cU=rho*cN, e=0")
p("# rho urgent_signals normal_fake precision urgent normal robots crowd")
for rho in RHOS:
    s = reader(R, rho * 0.6, 0.6)
    p(f"{rho:.2f} {s['sU']:.3f} {s['sN']:.3f} {s['precision']:.3f} {s['cU']:.3f} {s['cN']:.3f} {s['cR']:.3f} {s['crowd']:.3f}")
p()

p("== C. urgent people's gain over yield-all (positive = urgent better off), by rho and cN, e=0")
p("# rho " + " ".join(f"cN={c}" for c in CNS))
for rho in RHOS:
    p(f"{rho:.2f} " + " ".join(f"{Y['cU'] - reader(R, rho * c, c)['cU']:+.3f}" for c in CNS))
p()

p("== D. crowd cost minus yield-all (negative = crowd better off), by rho and cN, e=0")
p("# rho " + " ".join(f"cN={c}" for c in CNS))
for rho in RHOS:
    p(f"{rho:.2f} " + " ".join(f"{reader(R, rho * c, c)['crowd'] - Y['crowd']:+.3f}" for c in CNS))
p()

p("== E. largest rho (cN best of the grid 0.1..1.5) at which urgent people still gain over yield-all, by reading error e")
p("# e rho_max best_cN gain_at_rho_max")
grid = [0.1 * i for i in range(1, 16)]
for e in (0.0, 0.1, 0.2):
    Ye = yield_all(R, e)
    best = None
    for rho in [i / 40 for i in range(41)]:
        gains = [(Ye["cU"] - reader(R, rho * c, c, e)["cU"], c) for c in grid]
        g, c = max(gains)
        if g > 0:
            best = (rho, c, g)
    p(f"{e:.1f} {best[0]:.3f} {best[1]:.1f} {best[2]:+.3f}")
p()

p("== F. perfect reading (urgentdoor reader) cost to normal people versus yield-all: the transfer the signal cannot avoid")
p("# urgent_gain normal_loss robots_gain crowd_change")
Z = reader(R, 0.0, 9.0)  # urgent signal free, normal never: perfect reading
p(f"{Y['cU'] - Z['cU']:+.3f} {Z['cN'] - Y['cN']:+.3f} {Y['cR'] - Z['cR']:+.3f} {Z['crowd'] - Y['crowd']:+.3f}")
p()

p("== G. robot share, rho=0.25, cN=0.6: urgent gain / crowd change vs yield-all at the same share")
p("# robots urgent_gain normal_change crowd_change")
for r in (0.1, 0.3, 0.5, 0.7):
    Yr, s = yield_all(r), reader(r, 0.15, 0.6)
    p(f"{r:.1f} {Yr['cU'] - s['cU']:+.3f} {s['cN'] - Yr['cN']:+.3f} {s['crowd'] - Yr['crowd']:+.3f}")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
