"""Deterministic experiments for society-learncue; writes results.txt next to this file."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_learncue import learn, outcome  # noqa: E402
from society_cheapcue import yield_all, reader  # noqa: E402

out = []


def p(s=""):
    out.append(s)
    print(s, flush=True)


R, CN = 0.3, 0.6
Y = yield_all(R)
p("== A. yield-all baseline (r=0.3, u=0.2, wu=3, k=3, w=d=1)")
p("# urgent normal robots crowd")
p(f"{Y['cU']:.3f} {Y['cN']:.3f} {Y['cR']:.3f} {Y['crowd']:.3f}")
p()

p("== B. fixed reader fleet (gS=0, gQ=1) at cN=0.6, for reference")
p("# rho urgent normal robots crowd")
for rho in (1.0, 0.5, 0.25, 0.0):
    s = reader(R, rho * CN, CN)
    p(f"{rho:.2f} {s['cU']:.3f} {s['cN']:.3f} {s['cR']:.3f} {s['crowd']:.3f}")
p()

p("== C. learning fleet, logit sharpness br=8, from three starts (reader, all-go, indifferent)")
p("# rho start gS gQ converged sU sN urgent normal robots crowd")
for rho in (1.0, 0.5, 0.25, 0.0):
    for st in ((0.0, 1.0), (1.0, 1.0), (0.5, 0.5)):
        gS, gQ, ok = learn(R, rho * CN, CN, br=8.0, start=st)
        s = outcome(R, gS, gQ, rho * CN, CN)
        p(f"{rho:.2f} {st[0]:.1f}/{st[1]:.1f} {gS:.3f} {gQ:.3f} {int(ok)} {s['sU']:.3f} {s['sN']:.3f} "
          f"{s['cU']:.3f} {s['cN']:.3f} {s['cR']:.3f} {s['crowd']:.3f}")
p()

p("== D. sharpness br (rho=0.25, start reader): learning fleet minus yield-all (negative = better off)")
p("# br gS gQ urgent normal robots crowd")
for br in (2.0, 4.0, 8.0, 16.0, 32.0):
    gS, gQ, _ = learn(R, 0.25 * CN, CN, br=br)
    s = outcome(R, gS, gQ, 0.25 * CN, CN)
    p(f"{br:.0f} {gS:.3f} {gQ:.3f} {s['cU']-Y['cU']:+.3f} {s['cN']-Y['cN']:+.3f} {s['cR']-Y['cR']:+.3f} {s['crowd']-Y['crowd']:+.3f}")
p()

p("== E. collision cost k (rho=0.25, br=8): urgent gain over yield-all, crowd cost minus yield-all")
p("# k gS gQ urgent_gain crowd_minus_yieldall")
for k in (1.5, 2.0, 3.0, 4.0, 6.0):
    Yk = yield_all(R, k=k)
    gS, gQ, _ = learn(R, 0.25 * CN, CN, br=8.0, k=k)
    s = outcome(R, gS, gQ, 0.25 * CN, CN, k=k)
    p(f"{k:.1f} {gS:.3f} {gQ:.3f} {Yk['cU']-s['cU']:+.3f} {s['crowd']-Yk['crowd']:+.3f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
