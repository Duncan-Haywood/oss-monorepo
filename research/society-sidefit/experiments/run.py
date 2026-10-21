"""Write experiments/results.txt.   PYTHONPATH=src python3 experiments/run.py   (a few minutes, seeded)"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_sidefit import critical_share, fit_sl, observed_l_share, simulate  # noqa: E402

DATA = json.loads((HERE.parent / "data" / "moussaid2009_fig4.json").read_text())["panels"]
N, ROUNDS, SEEDS = 200, 500, 12
out = []


def say(x=""):
    print(x, flush=True)
    out.append(x)


def read(panel):
    p = DATA[panel]
    unit = 2 * (p["frame_bottom_px"] - p["dotted_px"])
    left = (p["frame_bottom_px"] - p["left_top_px"]) / unit
    right = (p["frame_bottom_px"] - p["right_top_px"]) / unit
    return left, right


def cell(sl, rho_c):
    return "none" if sl is None else f"{sl:.3f}/{rho_c:.3f}"


mean = lambda xs: sum(xs) / len(xs)  # noqa: E731

l3, r3 = read("condition_3_two_walkers_head_on")
l2, r2 = read("condition_2_static_obstacle")
ELL = 0.17  # 0.175 read, rounded down; 0.14 to 0.20 is swept
say("society-sidefit results. Model of society-blocs; observable = share of L (left) choices in a head-on meeting "
    "of a crowd in the status-quo (R) convention with no robots. Cells are sl/rho_c unless stated.")
say()
say("== A. Measured side preference, read from Moussaid et al. 2009 Fig. 4 (bar heights, see data/)")
say(f"condition 3 (two walkers head on): left {l3:.3f}, right {r3:.3f}, sum {l3 + r3:.3f}; left share of the two {l3 / (l3 + r3):.3f}")
say(f"condition 2 (static obstacle):     left {l2:.3f}, right {r2:.3f}, sum {l2 + r2:.3f}; left share of the two {l2 / (l2 + r2):.3f}")
say(f"central value used below: ell = {ELL} (0.14 to 0.20 swept)")
say()
say("== B. Fit at ell = 0.17, sr = 0: stubborn-L share sl and mean-field tipping share rho_c, by error rate eps")
EPSS = (0.02, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30)
say("eps   " + "  ".join(f"M{m:<11}" for m in (5, 9, 17)))
for eps in EPSS:
    row = []
    for m in (5, 9, 17):
        sl = fit_sl(0.17, 0.0, m, eps)
        row.append(f"{cell(sl, None if sl is None else critical_share(sl, 0.0, m, eps)):<12}")
    say(f"{eps:<5} " + "  ".join(row))
say()
say("== C. Same, M = 9, eps = 0.02 and 0.20, by measured left share ell (sr = 0)")
ELLS = (0.10, 0.14, 0.17, 0.20, 0.25, 0.30, 0.40)
say("ell   eps0.02       eps0.20       unbiased-crowd")
for ell in ELLS:
    a = fit_sl(ell, 0.0, 9, 0.02)
    b = fit_sl(ell, 0.0, 9, 0.20)
    say(f"{ell:<5} {cell(a, None if a is None else critical_share(a, 0.0, 9, 0.02)):<13} "
        f"{cell(b, None if b is None else critical_share(b, 0.0, 9, 0.20)):<13} {critical_share(0.0, 0.0, 9, 0.02):.3f}")
say()
say("== D. Same, ell = 0.17, M = 9, with a stubborn-R share sr (sl re-fitted)")
say("sr    eps0.02       eps0.10       eps0.20")
for sr in (0.0, 0.1, 0.2, 0.3):
    row = []
    for eps in (0.02, 0.10, 0.20):
        sl = fit_sl(0.17, sr, 9, eps)
        row.append(f"{cell(sl, None if sl is None else critical_share(sl, sr, 9, eps)):<13}")
    say(f"{sr:<5} " + " ".join(row))
say()
say("== E. Simulation check (M = 9, ell = 0.17, sr = 0): human L share at rho = 0, and share of crowds tipped, "
    f"N={N}, {ROUNDS} rounds, {SEEDS} seeds")
say("eps   sl     mf_Lshare  sim_Lshare  rho_c(mf)  rho_below  tipped  rho_above  tipped")
for eps in (0.02, 0.10, 0.20):
    sl = fit_sl(0.17, 0.0, 9, eps)
    rc = critical_share(sl, 0.0, 9, eps)
    sims0 = [simulate(N, 0.0, sl, 0.0, 9, eps, ROUNDS, s) for s in range(SEEDS)]
    lo, hi = max(0.0, round(rc - 0.04, 2)), round(rc + 0.04, 2)
    tip = {}
    for rho in (lo, hi):
        tip[rho] = mean([simulate(N, rho, sl, 0.0, 9, eps, ROUNDS, s)["final_share_l"] > 0.5 for s in range(SEEDS)])
    say(f"{eps:<5} {sl:<6.3f} {observed_l_share(sl, 0.0, 9, eps):<10.3f} {mean([r['human_l_share'] for r in sims0]):<11.3f} "
        f"{rc:<10.3f} {lo:<10.2f} {tip[lo]:<7.2f} {hi:<10.2f} {tip[hi]:.2f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
