"""Milestone 2f: do the 2d (sourced-margin) rankings survive adding idle time so the cycle's load factor matches a measured trace?

2e found the force-model cycles have load factor 0.61 (median) against 0.346 / 0.375 for the Zenodo 18862594 electric-excavator
traces. Here one idle phase (engine running, levers neutral) is appended to each 2c cycle, long enough to bring the cycle's
load factor (mean useful power / peak phase power) to a target. Idle demand: 2 to 8 L/min (pilot and leakage) at 10 to 25 bar,
ASSUMED (no source). Margins as 2d: dp_spool 6 bar, dp_ls 25 bar, eta 0.883, dp_m swept 3 to 10 bar. Open-centre keeps full pump
flow at idle (the pessimistic bleed of the model); load-sensing is charged demand x (p + margin), so it ignores the real
standby flow of a load-sensing pump (a bias in load-sensing's favour at idle). Stdlib, seeded.
"""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(__file__)
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
from heavy_hydraulics import Phase, Actuator, cycle_energy

def useful_power(ph):
    return sum(a.pressure * a.flow for a in ph.actuators)  # bar x L/min, proportional to W

def with_idle(c, target_lf, rng):
    peak = max(useful_power(p) for p in c)
    e = sum(useful_power(p) * p.seconds for p in c)
    T = sum(p.seconds for p in c)
    idle = Phase("idle", 0.0, (Actuator(rng.uniform(10, 25), rng.uniform(2, 8)),))
    t_total = e / (target_lf * peak)
    t_idle = max(0.0, t_total - T)
    return c + (Phase("idle", t_idle, idle.actuators),)

def run(target_lf, n_per_seed=1000):
    ls, mt, wins = [], [], 0
    for s in pc.SEEDS:
        for i in range(n_per_seed):
            rng = random.Random(s * 7919 + i)
            c, _, _, dpm = pc.one(rng)
            if target_lf is not None:
                c = with_idle(c, target_lf, rng)
            e = {k: cycle_energy(c, k, pump_flow=pc.Q_PUMP, dp_spool=6.0, dp_ls=25.0, dp_m=dpm, eta_pump=0.883)["shaft_J"]
                 for k in ("open_centre", "load_sensing", "metered")}
            ls.append(e["load_sensing"] / e["open_centre"]); mt.append(e["metered"] / e["load_sensing"])
    q = lambda x, f: sorted(x)[min(len(x) - 1, int(f * len(x)))]
    return statistics.median(ls), q(ls, .05), q(ls, .95), 100 * sum(x > 1 for x in ls) / len(ls), statistics.median(mt)

if __name__ == "__main__":
    print("sourced margins (dp_spool 6, dp_ls 25, eta 0.883); 5000 cycles per row")
    print("target load factor | LS/OC median (5-95%) | LS>OC share | Met/LS median")
    for lf in (None, 0.5, 0.375, 0.346, 0.25, 0.15):
        m, lo, hi, w, mm = run(lf)
        print(f"{'none (2d)' if lf is None else lf:>10} | {m:.3f} ({lo:.3f} to {hi:.3f}) | {w:5.1f}% | {mm:.3f}")
