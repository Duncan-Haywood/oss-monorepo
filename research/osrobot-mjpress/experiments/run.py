"""osrobot-mjpress: osrobot-mjface peak forces converted to contact pressure over a swept contact area.
Writes experiments/results.txt.

    python experiments/run.py        # about 90 s; needs `pip install mujoco`
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "osrobot-mjfeed" / "src"))
import osrobot_mjfeed.model as mj          # noqa: E402

K_FACE = 75000.0
SEEDS = range(200)
SPEEDS = (0.02, 0.05, 0.10, 0.20)
DAMP = (4, 100, 1000)
AREAS_CM2 = (0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0)     # swept contact areas
P_LIMITS = (20.0, 55.0, 110.0)                         # N/cm2: range seen in secondary sources (README)
E_FACE = (0.05e6, 0.5e6, 5e6)                          # Pa: swept, unsourced
F_LIMIT = 65.0


def hertz_area_cm2(f, r, e):
    """Contact area (cm2) of a sphere radius r (m) pressed by f (N) on a half-space of modulus e (Pa), nu=0.5."""
    estar = e / (2 * (1 - 0.25))
    a = (3 * f * r / (4 * estar)) ** (1 / 3)
    return math.pi * a * a * 1e4


def collect():
    peaks = {}
    for b in DAMP:
        m = mj.build(K_FACE, b)
        for v in SPEEDS:
            peaks[(b, v)] = sorted(mj.run_trial(mj.Design(sense="camera", v_app=v), 0.03, s, m=m)["peak"] for s in SEEDS)
    return peaks


def share_under(pk, area, plim):
    return sum(1 for f in pk if f / area <= plim) / len(pk)


if __name__ == "__main__":
    pk = collect()
    out = []
    P = out.append
    P("# osrobot-mjpress: camera arm, k=75000 N/m, 30 mm sway, 200 seeds (mujoco %s); peak force from osrobot-mjface model" % mj.mujoco.__version__)
    P("# Part 1: peak force quantiles (N): b v mean p95 max")
    for (b, v), x in pk.items():
        P("%d  %.2f  %.2f  %.2f  %.2f" % (b, v, sum(x) / len(x), x[int(0.95 * len(x))], x[-1]))
    P("# Part 2: area (cm2) needed so the worst trial stays within each pressure limit: b v A@20 A@55 A@110")
    for (b, v), x in pk.items():
        P("%d  %.2f  %s" % (b, v, "  ".join("%.2f" % (x[-1] / p) for p in P_LIMITS)))
    P("# Part 3: Hertz sphere (R=%.0f mm) contact area (cm2) at the worst peak, b=1000 v=0.20 (%.1f N), by face modulus E (Pa)" % (mj.R_TIP * 1e3, pk[(1000, 0.20)][-1]))
    for e in E_FACE:
        a = hertz_area_cm2(pk[(1000, 0.20)][-1], mj.R_TIP, e)
        P("E=%g  A=%.4f  p=%.1f N/cm2" % (e, a, pk[(1000, 0.20)][-1] / a))
    P("# Part 4: share of trials within pressure limit, b=1000 v=0.20, by area: A  s@20  s@55  s@110")
    for a in AREAS_CM2:
        P("%.2f  %s" % (a, "  ".join("%.2f" % share_under(pk[(1000, 0.20)], a, p) for p in P_LIMITS)))
    P("# Part 5: same at b=4 v=0.10: A  s@20  s@55  s@110")
    for a in AREAS_CM2:
        P("%.2f  %s" % (a, "  ".join("%.2f" % share_under(pk[(4, 0.10)], a, p) for p in P_LIMITS)))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
