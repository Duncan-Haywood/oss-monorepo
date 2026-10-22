"""osrobot-mjsoft: feeding-arm trials against a bonded soft-tissue lip. Writes experiments/results.txt.

    python experiments/run.py        # several minutes; needs `pip install mujoco`
"""
from pathlib import Path
import soft
from soft import fm, layer

HERE = Path(__file__).resolve().parent
SEEDS = range(100)
E_KPA = (4.0, 10.0, 45.0)               # span of in-vivo values in osrobot-mjmodulus
H_MM = (5.0, 15.0)                      # thin cheek-like and the 15 mm lip mean (osrobot-mjlayer)
SPEEDS = (0.02, 0.05, 0.10, 0.20)
CAPS = (None, 0.5)                      # arm force cap, N (None = the 20 N actuator limit)
B_DAMP = 10.0                           # N s/m tissue damping: ASSUMED (swept in Part 4)
AMP = 0.03                              # 30 mm sway, as osrobot-mjface


def q(xs, p):
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def cell(e, h, v, cap, b=B_DAMP):
    rs = [soft.run_trial(fm.Design(sense="camera", v_app=v, f_cap=cap), AMP, s, e * 1e3, h * 1e-3, b) for s in SEEDS]
    pk = sorted(r["peak"] for r in rs)
    n = len(rs)
    return ("%d%%" % round(100 * sum(r["entered"] for r in rs) / n), "%.2f" % q(pk, 0.5), "%.2f" % q(pk, 0.95), "%.2f" % pk[-1],
            "%.2f" % max(r["depth"] for r in rs),
            "%d%%" % round(100 * sum(1 for r in rs if r["depth"] <= layer.D_OVER_H_MAX) / n),
            "%.1f" % (sum(r["t"] for r in rs) / n))


if __name__ == "__main__":
    out = []
    P = out.append
    P("# osrobot-mjsoft: camera arm, 30 mm sway, %d seeds, tissue damping %.0f N s/m, bone stop from %.1f h (mujoco %s)" % (len(SEEDS), B_DAMP, soft.BONE_FRAC, soft.mujoco.__version__))
    P("# Part 1: E(kPa) h(mm) v(m/s) cap(N) budget(N) | success peakF_p50 p95 max (N) | max depth/h | share of trials with depth <= 0.3 h | mean time (s)")
    for h in H_MM:
        for e in E_KPA:
            bud = layer.budget(fm.R_TIP, e * 1e3, h * 1e-3)
            for v in SPEEDS:
                for cap in CAPS:
                    P("%g %g %.2f %s %.2f | %s" % (e, h, v, "none" if cap is None else cap, bud, " ".join(cell(e, h, v, cap))))
    P("# Part 2: blocked blind arm (still mouth shifted 20 mm, 20 seeds, 12 s): E(kPa) h(mm) cap(N) | steady push (N) | max depth/h | depth predicted by the mjlayer law at that push (mm) | budget (N)")
    for e, h in ((10.0, 15.0), (4.0, 15.0), (10.0, 5.0)):
        for cap in (None, 2.0, 0.5, 0.2):
            rs = [soft.run_trial(fm.Design(sense="none", v_app=0.05, f_cap=cap), 0.0, s, e * 1e3, h * 1e-3, B_DAMP, offset=0.02) for s in range(20)]
            push = sum(r["push"] for r in rs) / len(rs)
            dep = max(r["depth"] for r in rs)
            pred = layer.depth(push, fm.R_TIP, e * 1e3, h * 1e-3) * 1e3 if push > 0 else 0.0
            P("%g %g %s | %.2f | %.2f | %.2f | %.2f" % (e, h, "none" if cap is None else cap, push, dep, pred, layer.budget(fm.R_TIP, e * 1e3, h * 1e-3)))
    P("# Part 3: tissue damping b (N s/m) at E=10 kPa h=15 mm v=0.10 cap none: b | success peakF_p50 p95 max | max depth/h | share within 0.3 h | mean time")
    for b in (1.0, 10.0, 100.0):
        P("%g | %s" % (b, " ".join(cell(10.0, 15.0, 0.10, None, b))))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
