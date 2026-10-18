"""Experiments for ambient-cluster. Output: experiments/results.txt (deterministic, seeded)."""
import numpy as np

from ambient_cluster.sim import World, metrics, run_policy, simulate, tune_tau

SEEDS = 10
TRAIN_H, TEST_H = 30, 100
BUDGETS = (1.0, 4.0)
CLUSTER = (0.03, 0.15, 0.25)  # P(need | episode); 0.03 = no clustering
GRIDS = {"plain": [(0, 0.0)],
         "cooldown": [(k, 0.0) for k in (3, 6, 12, 30)],
         "boost": [(k, dl) for k in (6, 12, 30) for dl in (0.5, 1.0, 2.0)],
         "backoff": [(k, dl) for k in (6, 12, 30) for dl in (0.5, 1.0, 2.0)]}


def best_on_train(train, budget, kind):
    best = None
    for k, dl in GRIDS[kind]:
        tau = tune_tau(train, budget, kind, k, dl)
        r = metrics(train, run_policy(train, tau, kind, k, dl))["recall"]
        if best is None or r > best[0]:
            best = (r, tau, k, dl)
    return best[1:]


def ms(xs):
    xs = np.array(xs, float)
    return f"{xs.mean():.3f}+-{xs.std():.3f}"


def main():
    out = []
    p = out.append
    b = World()
    p(f"world: prevalence={b.prevalence} episode share={b.pi_episode} mean episode={b.mean_episode} windows "
      f"d'={b.d_prime} wake={b.p_wake_need}/{b.p_wake_other}; {SEEDS} seeds, train {TRAIN_H} h, test {TEST_H} h")
    p("policy parameters (k, delta) are chosen on the training hours by best recall at the budget; "
      "numbers are on fresh test hours; +- is the sd over seeds")
    p("")
    for budget in BUDGETS:
        p(f"== recall at {budget} false interruptions per hour (test fp/h in brackets) ==")
        p(f"{'P(need|episode)':16s}" + "".join(f"{k:>26s}" for k in GRIDS))
        for pe in CLUSTER:
            w = World(p_need_episode=pe)
            row, chosen, recs = {}, {}, {}
            for kind in GRIDS:
                rec, fps, ch = [], [], []
                for s in range(SEEDS):
                    tr = simulate(w, TRAIN_H, np.random.default_rng(100 + s))
                    te = simulate(w, TEST_H, np.random.default_rng(1000 + s))
                    tau, k, dl = best_on_train(tr, budget, kind)
                    m = metrics(te, run_policy(te, tau, kind, k, dl))
                    rec.append(m["recall"]); fps.append(m["fp_per_hour"]); ch.append((k, dl))
                recs[kind] = np.array(rec)
                row[kind] = f"{ms(rec)} ({np.mean(fps):.2f})"
                chosen[kind] = max(set(ch), key=ch.count)
            p(f"{pe:<16.2f}" + "".join(f"{row[k]:>26s}" for k in GRIDS))
            p(f"{'  most chosen':16s}" + "".join(f"{str(chosen[k]):>26s}" for k in GRIDS))
            diff = {k: recs[k] - recs["plain"] for k in GRIDS if k != "plain"}
            p(f"{'  paired diff':16s}{'':>26s}" + "".join(
                f"{d.mean():>+17.3f} (se {d.std(ddof=1) / np.sqrt(len(d)):.3f})"[-26:].rjust(26) for d in diff.values()))
        p("")
    open(__file__.replace("run.py", "results.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
