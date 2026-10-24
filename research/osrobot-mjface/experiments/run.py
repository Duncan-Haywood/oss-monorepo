"""osrobot-mjface: the osrobot-mjfeed feeding trial with face stiffness and force limits from ISO/TS 15066.
Writes experiments/results.txt.

    python experiments/run.py        # a few minutes; needs `pip install mujoco`
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "osrobot-mjfeed" / "src"))   # the model this extends, unchanged
import osrobot_mjfeed.model as mj          # noqa: E402

SEEDS = range(200)
K_FACE = 75000.0                 # N/m: ISO/TS 15066 Table A.3 effective spring constant, face (75 N/mm); see README
LIMITS = (2.0, 65.0, 130.0)      # N: the assumed mjfeed limit; face limits as listed for the two contact types (README)
out = []
P = out.append
P("# osrobot-mjface: osrobot-mjfeed trial at ISO/TS 15066 face stiffness (mujoco %s). 200 seeds. k=%d N/m" % (mj.mujoco.__version__, K_FACE))
P("# Sweep 1: arm blocked by the lips (blind arm, mouth fixed 30 mm off aim); impact peak (N) by contact stiffness k, damping b, approach speed v")
P("# columns: k(N/m)  b(N s/m)  v=0.02  v=0.05  v=0.10  v=0.20   (steady push is 0.40 2.0 4.0 N for v=0.02 0.10 0.20)")
for k in (800.0, K_FACE):
    for b in (4, 100, 300, 1000):
        m = mj.build(k, b)
        pk = [mj.run_trial(mj.Design(sense="none", v_app=v), 0.0, 0, offset=0.03, m=m)["peak"] for v in (0.02, 0.05, 0.10, 0.20)]
        P("%d  %d  %s" % (k, b, "  ".join("%.2f" % p for p in pk)))

P("# Sweep 2: camera arm, 30 mm sway, 200 seeds; share fed (entered) with peak contact force at most the limit")
P("# columns: k  b  v  fed  safe<=2N  safe<=65N  safe<=130N  peak_mean  peak_p95  peak_max")
for k, b in ((800.0, 4), (K_FACE, 4), (K_FACE, 100), (K_FACE, 1000)):
    m = mj.build(k, b)
    for v in (0.02, 0.05, 0.10, 0.20):
        rs = [mj.run_trial(mj.Design(sense="camera", v_app=v), 0.03, s, m=m) for s in SEEDS]
        n = len(rs)
        pk = sorted(r["peak"] for r in rs)
        safe = [sum(1 for r in rs if r["entered"] and r["peak"] <= L) / n for L in LIMITS]
        P("%d  %d  %.2f  %.2f  %.2f  %.2f  %.2f  %.2f  %.2f  %.2f" % (
            k, b, v, sum(r["entered"] for r in rs) / n, *safe, sum(pk) / n, pk[int(0.95 * n)], pk[-1]))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
