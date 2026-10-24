"""Does widening the gain grid, or letting the controller use the twin's gravity, change which wrong twins are costly?

    python experiments/run.py fixed    # controller energy estimate uses g/L = 9.81, as in mimic-twinswing
    python experiments/run.py aware    # the controller uses the gravity of the twin it was tuned on
    python experiments/run.py report   # writes results.txt from results_fixed.json and results_aware.json

Each mode takes ~10 to 20 minutes on 4 CPUs and writes results_<mode>.json next to this file.
"""
import json
import sys
from multiprocessing import Pool
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import twin

SEEDS = range(8)           # tuning seeds (controller regret)
C2ST_SEEDS, N_C2ST = (0, 1, 2), 800
N_EVAL = 600
R = twin.REAL
TWINS = [
    ("exact twin (null)", dict(R)),
    ("coul -33%", dict(R, coul=0.2)), ("coul = 0", dict(R, coul=0.0)),
    ("visc x2", dict(R, visc=0.2)), ("visc x0.5", dict(R, visc=0.05)),
    ("g/L +10%", dict(R, glo=9.81 * 1.1)), ("g/L -10%", dict(R, glo=9.81 * 0.9)),
    ("g/L +20%", dict(R, glo=9.81 * 1.2)), ("g/L -20%", dict(R, glo=9.81 * 0.8)),
    ("gauss noise, same sd", dict(R, kind="gauss")),
    ("noise sd x0.5", dict(R, sd=0.01)), ("noise sd x1.5", dict(R, sd=0.03)), ("noise sd x2", dict(R, sd=0.04)),
    ("noise sd x0 (no noise)", dict(R, sd=0.0)),
]


def one(args):
    mode, name, cfg = args
    gains = twin.gain_grid()
    regrets, picks = [], []
    for s in SEEDS:
        gnom = cfg["glo"] if mode == "aware" else twin.G_NOM
        i, _ = twin.tune(cfg, np.random.default_rng(10_000 + s), n=150, gains=gains, gnom=gnom)
        ev = np.random.default_rng(20_000 + s)          # held-out real starts and noise, shared by all twins
        starts = twin.draw_starts(ev, N_EVAL)
        # best the grid can do on the real system, with the correct gravity: the regret reference
        best = twin.swing_cost(starts, gains, R, np.random.default_rng(30_000 + s)).min()
        mine = twin.swing_cost(starts, [gains[i]], R, np.random.default_rng(30_000 + s), gnom=gnom)[0]
        regrets.append(float(mine - best)); picks.append(gains[i])
    aucs, rm = [], []
    for s in C2ST_SEEDS:
        rng = np.random.default_rng(1000 + s)
        th0, clean, real = twin.passive(rng, N_C2ST, R)
        _, _, tw = twin.passive(rng, N_C2ST, cfg)
        aucs.append(twin.c2st(real, tw, seed=s))
        rm.append(twin.paired_rmse(th0, clean, cfg))
    return dict(twin=name, auroc=float(np.mean(aucs)), rmse=float(np.mean(rm)), regret=float(np.mean(regrets)),
                regret_sd=float(np.std(regrets)), regret_med=float(np.median(regrets)), gains=[list(g) for g in picks])


def load(mode):
    return json.loads((HERE / f"results_{mode}.json").read_text())


def report():
    out = []
    def say(s=""):
        out.append(s)
    n = len(twin.gain_grid())
    say(f"Real system: {R}. Grid of {n} controllers (ke, kp, kd, cap), ke up to 32; tuned on 150 twin starts, scored on {N_EVAL} held-out real starts.")
    say(f"Regret = real cost of the twin-tuned controller minus the best of the grid on the real system with the true gravity. Mean over {len(SEEDS)} tuning seeds.")
    say("fixed = controller energy estimate uses g/L = 9.81; aware = it uses the twin's own g/L. AUROC: boosted trees, 800 vs 800, mean over 3 seeds.")
    say()
    f, a = load("fixed"), load("aware")
    say(f"{'twin':<24}{'AUROC':>7}{'RMSE':>9}{'fixed':>10}{'sd':>9}{'aware':>10}{'sd':>9}  fixed picks ke (modal)")
    for rf, ra in zip(f, a):
        kes = [g[0] for g in rf["gains"]]
        modal = max(set(kes), key=kes.count)
        say(f"{rf['twin']:<24}{rf['auroc']:>7.3f}{rf['rmse']:>9.4f}{rf['regret']:>10.5f}{rf['regret_sd']:>9.5f}{ra['regret']:>10.5f}{ra['regret_sd']:>9.5f}  {modal}")
    for label, rows in (("fixed", f), ("aware", a)):
        ok = rows[1:]
        for key in ("auroc", "rmse"):
            rho, p = spearmanr([r[key] for r in ok], [r["regret"] for r in ok])
            say(f"Spearman({key}, regret), {label}, over {len(ok)} wrong twins: rho={rho:.2f}, p={p:.3f}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "report":
        report()
    else:
        with Pool(4) as pool:
            rows = pool.map(one, [(mode, n, c) for n, c in TWINS])
        (HERE / f"results_{mode}.json").write_text(json.dumps(rows, indent=1))
        for r in rows:
            print(mode, r["twin"], r["auroc"], r["regret"], flush=True)
