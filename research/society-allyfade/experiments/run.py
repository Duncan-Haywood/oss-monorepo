"""Write experiments/results.txt.   PYTHONPATH=src python3 experiments/run.py   (several minutes, seeded)"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "society-blocs" / "src"))
from society_allyfade import simulate, tipped  # noqa: E402
from society_blocs import critical_share  # noqa: E402

N, ROUNDS, SEEDS, EPS, M = 200, 4000, 12, 0.02, 9
CS = [0.0, 0.001, 0.003, 0.01, 0.03, 0.1]
RHOS = [0.0, 0.02, 0.05, 0.10, 0.15, 0.20]
out = []


def say(x=""):
    print(x, flush=True)
    out.append(x)


def cell(rho, sl, sr, c_l, c_r):
    rs = [simulate(n=N, rho=rho, sl=sl, sr=sr, c_l=c_l, c_r=c_r, m=M, eps=EPS, rounds=ROUNDS, seed=s)
          for s in range(SEEDS)]
    return sum(tipped(r) for r in rs), rs


say(f"society-allyfade results. N={N}, {ROUNDS} rounds, {SEEDS} seeds per cell, eps={EPS}, M={M}. "
    "Cells show how many of the seeds end tipped (a majority of humans on L) after the allies have faded.")
say()
for sl, sr, c_r_mode in ((0.2, 0.0, "-"), (0.2, 0.1, "holdouts never fade"), (0.2, 0.1, "holdouts fade at the same rate")):
    say(f"== sl={sl} allies fade at rate c per round; sr={sr}"
        + ("" if sr == 0 else f" ({c_r_mode})"))
    say("mean-field rho_c with allies kept: %.4f; with no allies (sl=0, sr=%s kept): %.4f"
        % (critical_share(sl, sr, M, EPS), sr, critical_share(0.0, sr, M, EPS)))
    say("c       " + "  ".join(f"rho={r:<4}" for r in RHOS) + "   stubborn left (rho=0.05)")
    for c in CS:
        row, left = [], None
        for rho in RHOS:
            k, rs = cell(rho, sl, sr, c, c if c_r_mode.endswith("rate") else 0.0)
            row.append(f"{k:>2}/{SEEDS:<5}  ")
            if rho == 0.05:
                left = sum(r["stubborn_left"] for r in rs) / SEEDS
        say(f"{c:<7} " + "".join(row) + f"  {left:.1f}")
    say()
# time to first majority
say("== When does the tip happen? Median round of first majority among tipped seeds (sl=0.2, sr=0, rho=0.05)")
for c in CS:
    rs = [simulate(n=N, rho=0.05, sl=0.2, c_l=c, m=M, eps=EPS, rounds=ROUNDS, seed=s) for s in range(SEEDS)]
    fr = sorted(r["first_majority_round"] for r in rs if r["first_majority_round"])
    say(f"c={c:<6} first majority round (median of {len(fr)}): {fr[len(fr)//2] if fr else '-'}; "
        f"tipped at end {sum(map(tipped, rs))}/{SEEDS}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
