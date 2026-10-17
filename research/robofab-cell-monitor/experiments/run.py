"""Sweeps for robofab-cell-monitor. Writes experiments/results.txt. Deterministic (fixed seeds)."""
import pathlib, sys
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from robofab_cell_monitor import CellConfig, JobType, bound, replicate

A = JobType("A", 20)
B = JobType("B", 60)
SEEDS = range(40)
LAM = 0.3          # failures per printing hour
lines = []
def say(s=""):
    lines.append(s); print(s)
def fm(m): return f"{m[0]:6.2f} {m[1]:.2f}"

def cfg(P, **kw):
    return CellConfig((A, B), printers=P, wip=P + 2, cv=0.3, fail_rate=kw.pop("fail_rate", LAM),
                      horizon=48 * 60.0, **kw)

say("Types: A prints 20 min, B 60 min (equal mix); load/unload 2 min each; inspect 3 min; no inspection rejects.")
say("Failure rate 0.3 per printing hour unless stated (A fails 9.5%, B 25.9%). cv 0.3, wip = printers + 2,")
say("horizon 48 h, warm-up 4 h, 40 seeds. Each simulated value is followed by its standard error (good parts per hour).")

say("\n1. Printer count: blind printing against a camera that aborts 10 min after a failure")
say("P  blind_bound limit      blind sim  se  cam_bound limit      cam sim  se   gain_pct")
for P in [2, 4, 6, 8, 10, 12, 16]:
    cb, cc = cfg(P), cfg(P, monitor_delay=10.0)
    bb, lb, _ = bound(cb); bc, lc, _ = bound(cc)
    rb, rc = replicate(cb, SEEDS), replicate(cc, SEEDS)
    g = 100 * (rc["good_per_hour"][0] / rb["good_per_hour"][0] - 1)
    say(f"{P:2d} {60*bb:8.2f} {lb:11s} {fm(rb['good_per_hour'])} {60*bc:8.2f} {lc:11s} {fm(rc['good_per_hour'])} {g:8.1f}")

P = 6
say(f"\n2. Detection delay at P={P} (delay 'inf' = blind)")
say("delay_min  bound  sim  se  wasted_share")
for d in [0, 5, 10, 20, 40, 80, None]:
    c = cfg(P, monitor_delay=d)
    r = replicate(c, SEEDS)
    say(f"{'inf' if d is None else d:>9} {60*bound(c)[0]:6.2f} {fm(r['good_per_hour'])} {r['wasted_share'][0]:.3f}")

say(f"\n3. Camera false stops at P={P}, delay 10 min (per printing hour); blind sim shown for reference")
say("false_stop_per_h  bound  sim  se  mean_attempts")
rb = replicate(cfg(P), SEEDS)
say(f"blind {60*bound(cfg(P))[0]:6.2f} {fm(rb['good_per_hour'])} {rb['mean_attempts'][0]:.2f}")
for mu in [0.0, 0.05, 0.1, 0.2, 0.4, 0.8]:
    c = cfg(P, monitor_delay=10.0, false_stop=mu)
    r = replicate(c, SEEDS)
    say(f"{mu:16.2f} {60*bound(c)[0]:6.2f} {fm(r['good_per_hour'])} {r['mean_attempts'][0]:.2f}")

say(f"\n4. Failure rate at P={P}, delay 10 min, no false stops")
say("fail_rate_per_h  blind_sim  se  cam_sim  se  gain_pct")
for lam in [0.0, 0.1, 0.3, 0.6, 1.0]:
    rb = replicate(cfg(P, fail_rate=lam), SEEDS); rc = replicate(cfg(P, fail_rate=lam, monitor_delay=10.0), SEEDS)
    g = 100 * (rc["good_per_hour"][0] / rb["good_per_hour"][0] - 1)
    say(f"{lam:15.1f} {fm(rb['good_per_hour'])} {fm(rc['good_per_hour'])} {g:8.1f}")
(here / "results.txt").write_text("\n".join(lines) + "\n")
