"""Milestone 2g: do 2f's idle-time rankings survive a physical idle model for each circuit?

2f charged an idle phase to open-centre as full pump flow at (idle pressure + dp_spool) and to load-sensing as demand x
(p + dp_ls), with no standby flow. Both are biased towards LS. Here the idle phase (engine running, levers neutral) is
charged as: open-centre, full pump flow through the centre bypass at a neutral pressure p_n (swept 8 to 40 bar, plus the
2f bleed as a reference); load-sensing, idle demand at (p + dp_ls) plus a standby flow q_sb (swept 0 to 6 L/min) at the
standby pressure dp_ls. The work part of each cycle is as 2d (dp_spool 6, dp_ls 25, eta 0.883, dp_m swept 3 to 10).
p_n, q_sb and the idle demand are ASSUMED (swept, no measured source). Stdlib, seeded; same cycles and idle draws as 2f.
"""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(__file__)
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
from heavy_hydraulics import cycle_energy
from heavy_hydraulics.circuits import W_PER_BAR_LPM
from idle_sensitivity import useful_power

ETA, DP_SPOOL, DP_LS = 0.883, 6.0, 25.0

def ratio(target_lf, p_n, q_sb, n_per_seed=1000, dp_ls=DP_LS):
    """LS/OC shaft energy; p_n None = 2f's bleed at (p+dp_spool)."""
    out = []
    for s in pc.SEEDS:
        for i in range(n_per_seed):
            rng = random.Random(s * 7919 + i)
            c, _, _, dpm = pc.one(rng)
            peak = max(useful_power(p) for p in c)
            e = sum(useful_power(p) * p.seconds for p in c)
            t_idle = max(0.0, e / (target_lf * peak) - sum(p.seconds for p in c))
            p_i, q_i = rng.uniform(10, 25), rng.uniform(2, 8)
            kw = dict(pump_flow=pc.Q_PUMP, dp_spool=DP_SPOOL, dp_ls=dp_ls, dp_m=dpm, eta_pump=ETA)
            oc = cycle_energy(c, "open_centre", **kw)["shaft_J"]
            ls = cycle_energy(c, "load_sensing", **kw)["shaft_J"]
            h_oc = pc.Q_PUMP * (p_i + DP_SPOOL if p_n is None else p_n)
            h_ls = q_i * (p_i + dp_ls) + q_sb * dp_ls
            oc += h_oc * W_PER_BAR_LPM * t_idle / ETA
            ls += h_ls * W_PER_BAR_LPM * t_idle / ETA
            out.append(ls / oc)
    q = lambda f: sorted(out)[min(len(out) - 1, int(f * len(out)))]
    return statistics.median(out), q(.05), q(.95), 100 * sum(x > 1 for x in out) / len(out)

if __name__ == "__main__":
    print("LS/OC shaft-energy median (5-95%) | share LS>OC; 5000 cycles per cell")
    for lf in (0.5, 0.375, 0.346, 0.25):
        print(f"\nload factor {lf}")
        for p_n in (None, 40.0, 20.0, 8.0):
            for q_sb in (0.0, 2.0, 6.0):
                m, lo, hi, w = ratio(lf, p_n, q_sb)
                print(f"  OC idle {'bleed(2f)' if p_n is None else f'{p_n:g} bar':>9}, LS standby {q_sb:g} L/min: {m:.3f} ({lo:.3f} to {hi:.3f}) | {w:5.1f}%")
