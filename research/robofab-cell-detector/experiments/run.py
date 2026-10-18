"""Sweeps for robofab-cell-detector. Writes experiments/results.txt. Deterministic (fixed seeds)."""
import pathlib, sys
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from robofab_cell_detector import CellConfig, JobType, bound, replicate, roc

A = JobType("A", 20)
B = JobType("B", 60)
SEEDS = range(40)
LAM = 0.3          # failures per printing hour
P = 6
PERIOD = 2.0       # minutes between looks
lines = []
def say(s=""):
    lines.append(s); print(s)
def fm(m): return f"{m[0]:6.2f} {m[1]:.2f}"

def cfg(detector=None, fail_rate=LAM, printers=P):
    return CellConfig((A, B), printers=printers, wip=printers + 2, cv=0.3, fail_rate=fail_rate,
                      detector=detector, horizon=48 * 60.0)

def bnd(c): return 60 * bound(c)[0]

ZS = [round(0.25 * i, 2) for i in range(-4, 17)]       # -1 .. 4 in steps of 0.25
blind = replicate(cfg(), SEEDS)["good_per_hour"]
say(f"Types: A prints 20 min, B 60 min (equal mix); load/unload 2 min each; inspect 3 min; no inspection rejects.")
say(f"P={P}, failure rate {LAM} per printing hour, looks every {PERIOD:g} min, cv 0.3, wip = P + 2, horizon 48 h,")
say("warm-up 4 h, 40 seeds. Detector score is N(0,1) on a healthy print and N(d',1) on a failed one; an alarm aborts.")
say(f"Blind printing: bound {bnd(cfg()):.2f}, sim {fm(blind)} good parts/h (se after the value).")

say("\n1. Threshold z at P=6, by detectability d' (f = false-alarm prob per look, h = hit prob per look)")
say("dprime  z     f        h       bound  sim  se   gain_vs_blind_pct")
for dp in [1.0, 2.0, 3.0, 4.0]:
    for z in [-0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]:
        c = cfg((dp, z, PERIOD)); f, h = roc(dp, z)
        r = replicate(c, SEEDS)["good_per_hour"]
        say(f"{dp:6.1f} {z:5.2f} {f:8.5f} {h:7.4f} {bnd(c):6.2f} {fm(r)} {100*(r[0]/blind[0]-1):8.1f}")

say("\n2. Best threshold by the analytic bound, then checked by simulation (P=6)")
say("dprime  best_z  f        h       bound  sim  se   gain_vs_blind_pct")
for dp in [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]:
    z = max(ZS, key=lambda z: bnd(cfg((dp, z, PERIOD))))
    c = cfg((dp, z, PERIOD)); f, h = roc(dp, z)
    r = replicate(c, SEEDS)["good_per_hour"]
    say(f"{dp:6.1f} {z:7.2f} {f:8.5f} {h:7.4f} {bnd(c):6.2f} {fm(r)} {100*(r[0]/blind[0]-1):8.1f}")

say("\n3. Best threshold against failure rate, d'=2.5, P=6 (bound picks z; simulation at that z; blind sim for reference)")
say("fail_rate_per_h  best_z  f        h       blind_sim  se  det_sim  se  gain_pct")
for lam in [0.05, 0.1, 0.3, 0.6, 1.0]:
    z = max(ZS, key=lambda z: bnd(cfg((2.5, z, PERIOD), fail_rate=lam)))
    c = cfg((2.5, z, PERIOD), fail_rate=lam); f, h = roc(2.5, z)
    rd = replicate(c, SEEDS)["good_per_hour"]; rb = replicate(cfg(fail_rate=lam), SEEDS)["good_per_hour"]
    say(f"{lam:15.2f} {z:7.2f} {f:8.5f} {h:7.4f} {fm(rb)} {fm(rd)} {100*(rd[0]/rb[0]-1):8.1f}")

say("\n4. Best threshold against the time between looks, d'=2.5 per look, P=6")
say("period_min  best_z  f        h       bound  sim  se   gain_vs_blind_pct")
for per in [1.0, 2.0, 5.0, 10.0, 20.0]:
    z = max(ZS, key=lambda z: bnd(cfg((2.5, z, per))))
    c = cfg((2.5, z, per)); f, h = roc(2.5, z)
    r = replicate(c, SEEDS)["good_per_hour"]
    say(f"{per:10.0f} {z:7.2f} {f:8.5f} {h:7.4f} {bnd(c):6.2f} {fm(r)} {100*(r[0]/blind[0]-1):8.1f}")

say("\n5. Does the printer count move the best threshold? d'=2.5, bound only")
say("printers  best_z  bound  blind_bound")
for Pn in [2, 6, 10, 14]:
    z = max(ZS, key=lambda z: bnd(cfg((2.5, z, PERIOD), printers=Pn)))
    say(f"{Pn:8d} {z:7.2f} {bnd(cfg((2.5, z, PERIOD), printers=Pn)):6.2f} {bnd(cfg(printers=Pn)):6.2f}")
(here / "results.txt").write_text("\n".join(lines) + "\n")
