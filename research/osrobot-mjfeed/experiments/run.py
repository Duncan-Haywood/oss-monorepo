"""Four experiments: the osrobot-assist feeding trial in MuJoCo against its stylised twin. Writes experiments/results.txt.

    python experiments/run.py        # about a minute; needs `pip install mujoco`
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "osrobot-assist" / "src"))   # the stylised twin, for the paired comparison
import osrobot_mjfeed.model as mj          # noqa: E402
import osrobot_assist.model as st          # noqa: E402

SEEDS = range(200)
out = []
P = out.append


def D(mod, **kw):
    return mod.Design(**kw)


P("# osrobot-mjfeed: the osrobot-assist feeding trial in MuJoCo (mujoco %s) against the stylised twin. 200 paired seeds." % mj.mujoco.__version__)
P("# Sweep 1: arm blocked by the lips (blind arm, mouth fixed 30 mm off aim, no sway); contact force against approach speed")
P("# columns: v_app(m/s)  stylised_push=KP*LEAD*v(N)  mujoco_peak(N)  mujoco_steady(N, mean of last 1 s)  peak/push")
for v in (0.02, 0.05, 0.10, 0.20):
    r = mj.run_trial(mj.Design(sense="none", v_app=v), 0.0, 0, offset=0.03)
    push = mj.KP * mj.LEAD * v
    P("%.2f  %.2f  %.2f  %.2f  %.2f" % (v, push, r["peak"], r["f_tail"], r["peak"] / push))

P("# Sweep 2: same blocked arm at 0.10 m/s; contact damping b (N s/m) and stiffness k (N/m)")
P("# columns: k  b  mujoco_peak(N)  mujoco_steady(N)")
for k, b in ((800, 1), (800, 4), (800, 16), (800, 64), (3200, 4), (200, 4)):
    r = mj.run_trial(mj.Design(sense="none", v_app=0.10), 0.0, 0, offset=0.03, m=mj.build(k, b))
    P("%d  %d  %.2f  %.2f" % (k, b, r["peak"], r["f_tail"]))


def row(label, des_args, amp):
    a = mj.summarise(D(mj, **des_args), amp, SEEDS)
    b = st.summarise(D(st, **des_args), amp, SEEDS)
    P("%s  | mujoco: touch %.2f safe %.2f peak_mean %.2f peak_max %.2f ax_mean %.2f ax_max %.2f time %.2f | stylised: touch %.2f safe %.2f peak_mean %.2f peak_max %.2f time %.2f"
      % (label, a["touch"], a["safe"], a["peak_mean"], a["peak_max"], a["ax_mean"], a["ax_max"], a["time_mean"],
         b["touch"], b["safe"], b["peak_mean"], b["peak_max"], b["time_mean"]))


P("# Sweep 3: camera design, 30 mm sway, approach speed (m/s)")
for v in (0.02, 0.05, 0.10, 0.20):
    row("v=%.2f" % v, dict(sense="camera", v_app=v), 0.03)
P("# Sweep 4: camera against blind arm at 0.05 m/s, sway (mm)")
for sense in ("camera", "none"):
    for amp in (0.03, 0.05):
        row("%s sway=%d" % (sense, amp * 1000), dict(sense=sense, v_app=0.05), amp)
P("# Sweep 5: camera latency (s) at 0.10 m/s, 30 mm sway")
for dl in (0.0, 0.10, 0.40):
    row("delay=%.2f" % dl, dict(sense="camera", v_app=0.10, delay=dl), 0.03)

(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
