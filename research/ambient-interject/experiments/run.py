"""Experiments for ambient-interject. Output: experiments/results.txt (deterministic, seeded)."""
import numpy as np

from ambient_interject.sim import (World, fit_logistic, prob, score_policy, simulate, speak_keyword,
                                    speak_learned, speak_threshold, speak_wake, threshold_theory,
                                    tune_to_budget)

SEEDS = 20
GRID = np.linspace(-1, 6, 281)
TRAIN_H, TEST_H = 20, 200


def mean_sd(xs):
    xs = np.array(xs, float)
    return f"{np.nanmean(xs):.3f} +- {np.nanstd(xs):.3f}"


def fit(train):
    return fit_logistic(__import__("ambient_interject.sim", fromlist=["features"]).features(train),
                        train["need"].astype(float))


def tuned_policies(train, budget):
    """Return {name: function(d)->speak mask}, each tuned on `train` to <= budget false interrupts/h."""
    w = fit(train)
    tau = tune_to_budget(train, lambda d: d["score"], budget, GRID)
    pgrid = np.linspace(0.001, 0.999, 999)
    thr = tune_to_budget(train, lambda d: prob(w, d), budget, pgrid)
    return {"threshold": lambda d: speak_threshold(d, tau), "learned": lambda d: speak_learned(d, w, thr)}, tau


def main():
    out = []
    p = out.append
    base = World()
    p(f"world: prevalence={base.prevalence} d'={base.d_prime} p_wake(need)={base.p_wake_need} "
      f"p_wake(other)={base.p_wake_other} p_kw={base.p_kw_need}/{base.p_kw_other} "
      f"others={base.p_others} (cost x{base.others_cost}); {SEEDS} seeds, train {TRAIN_H} h, test {TEST_H} h")
    p("")

    p("== 1. Fixed policies (test world = training world) ==")
    for name, fn in [("wake word", speak_wake), ("keyword or wake", speak_keyword)]:
        ms = [score_policy(simulate(base, TEST_H, np.random.default_rng(1000 + s)),
                           fn(simulate(base, TEST_H, np.random.default_rng(1000 + s)))) for s in range(SEEDS)]
        p(f"{name:16s} precision {mean_sd([m['precision'] for m in ms])}  recall {mean_sd([m['recall'] for m in ms])}  "
          f"false/h {mean_sd([m['fp_per_hour'] for m in ms])}  missed/h {mean_sd([m['missed_per_hour'] for m in ms])}")
    p("")

    p("== 2. Closed form vs simulation for the threshold policy (2000 h) ==")
    d = simulate(base, 2000, np.random.default_rng(7))
    for tau in (0.5, 1.0, 1.5, 2.0, 3.0):
        s = speak_threshold(d, tau)
        fp_t, tp_t = threshold_theory(base, tau)
        p(f"tau {tau:3.1f}: P(speak|no need) sim {np.mean(s[~d['need']]):.4f} theory {fp_t:.4f};  "
          f"P(speak|need) sim {np.mean(s[d['need']]):.4f} theory {tp_t:.4f}")
    p("")

    p("== 3. Equal-annoyance comparison: recall at a budget of false interruptions per hour ==")
    p("(thresholds tuned on the training world; test on a fresh world with the same parameters)")
    for budget in (0.5, 1.0, 2.0, 4.0):
        res = {"threshold": [], "learned": []}
        fpr = {"threshold": [], "learned": []}
        kwr = []
        for s in range(SEEDS):
            tr = simulate(base, TRAIN_H, np.random.default_rng(s))
            te = simulate(base, TEST_H, np.random.default_rng(1000 + s))
            pols, _ = tuned_policies(tr, budget)
            for k, f in pols.items():
                m = score_policy(te, f(te)); res[k].append(m["recall"]); fpr[k].append(m["fp_per_hour"])
        p(f"budget {budget:3.1f}/h: threshold recall {mean_sd(res['threshold'])} (false/h {mean_sd(fpr['threshold'])});  "
          f"learned recall {mean_sd(res['learned'])} (false/h {mean_sd(fpr['learned'])})")
    kw = [score_policy(simulate(base, TEST_H, np.random.default_rng(1000 + s)),
                       speak_keyword(simulate(base, TEST_H, np.random.default_rng(1000 + s))))["fp_per_hour"] for s in range(SEEDS)]
    p(f"(keyword policy runs at {np.mean(kw):.1f} false/h, wake word at "
      f"{np.mean([score_policy(simulate(base, TEST_H, np.random.default_rng(1000 + s)), speak_wake(simulate(base, TEST_H, np.random.default_rng(1000 + s))))['fp_per_hour'] for s in range(SEEDS)]):.2f} false/h)")
    p("")

    p("== 4. Does the learned classifier beat a plain threshold? (utility = TP - annoyance, per hour; others talking cost x2) ==")
    p("learned policy here speaks iff P(need) > c/(1+c) with c = cost of a false interruption (x2 when others talk)")
    for c in (0.5, 1.0, 3.0):
        u_thr, u_lrn = [], []
        for s in range(SEEDS):
            tr = simulate(base, TRAIN_H, np.random.default_rng(s))
            te = simulate(base, TEST_H, np.random.default_rng(1000 + s))
            w = fit(tr)
            grid = np.linspace(-1, 6, 281)
            best_t = max(grid, key=lambda t: score_policy(tr, speak_threshold(tr, t), c_fp=c)["utility_per_hour"])
            u_thr.append(score_policy(te, speak_threshold(te, best_t), c_fp=c)["utility_per_hour"])
            cut = np.where(te["others"], c * te["others_cost"], c); cut = cut / (1 + cut)
            u_lrn.append(score_policy(te, te["wake"] | (prob(w, te) > cut), c_fp=c)["utility_per_hour"])
        p(f"c_fp {c:3.1f}: threshold(best on train) {mean_sd(u_thr)}   expected-utility rule {mean_sd(u_lrn)}")
    p("")

    p("== 5. Classifier quality: recall at 1 false interruption/hour vs d' (threshold policy, tuned on train) ==")
    for dp in (0.5, 1.0, 1.5, 2.0, 3.0, 4.0):
        w0 = World(d_prime=dp); r = []
        for s in range(SEEDS):
            tr = simulate(w0, TRAIN_H, np.random.default_rng(s)); te = simulate(w0, TEST_H, np.random.default_rng(1000 + s))
            tau = tune_to_budget(tr, lambda x: x["score"], 1.0, GRID)
            r.append(score_policy(te, speak_threshold(te, tau))["recall"])
        p(f"d' {dp:3.1f}: recall {mean_sd(r)}")
    p("")

    p("== 6. Twin gap: tune to 1 false/h in the simulator, deploy where the world differs ==")
    p("(training world is the default; 'real' worlds change one thing at a time)")
    shifts = {"same world": base,
              "weaker classifier d'=1.0": World(d_prime=1.0),
              "rarer needs (0.01)": World(prevalence=0.01),
              "commoner needs (0.06)": World(prevalence=0.06),
              "more keyword noise (0.20)": World(p_kw_other=0.20),
              "more wake false alarms (0.01)": World(p_wake_other=0.01),
              "noisier background (null sd 1.3)": World(null_sd=1.3)}
    for name, wd in shifts.items():
        fp_t, rc_t, fp_l, rc_l = [], [], [], []
        for s in range(SEEDS):
            tr = simulate(base, TRAIN_H, np.random.default_rng(s)); te = simulate(wd, TEST_H, np.random.default_rng(1000 + s))
            pols, _ = tuned_policies(tr, 1.0)
            m = score_policy(te, pols["threshold"](te)); fp_t.append(m["fp_per_hour"]); rc_t.append(m["recall"])
            m = score_policy(te, pols["learned"](te)); fp_l.append(m["fp_per_hour"]); rc_l.append(m["recall"])
        p(f"{name:30s} threshold: false/h {mean_sd(fp_t)} recall {mean_sd(rc_t)} | learned: false/h {mean_sd(fp_l)} recall {mean_sd(rc_l)}")
    p("")

    p("== 7. Recalibrating on a few labelled hours from the shifted world (noisier background null sd 1.3; wake false alarms 0.01) ==")
    for name, wd in (("null sd 1.3", World(null_sd=1.3)), ("wake false alarms 0.01", World(p_wake_other=0.01))):
        for hrs in (0, 1, 4, 16, 64):
            fps, rcs = [], []
            for s in range(SEEDS):
                tr = simulate(base, TRAIN_H, np.random.default_rng(s)); te = simulate(wd, TEST_H, np.random.default_rng(1000 + s))
                if hrs == 0:
                    tau = tune_to_budget(tr, lambda x: x["score"], 1.0, GRID)
                else:
                    cal = simulate(wd, hrs, np.random.default_rng(5000 + s))
                    tau = tune_to_budget(cal, lambda x: x["score"], 1.0, GRID)
                m = score_policy(te, speak_threshold(te, tau)); fps.append(m["fp_per_hour"]); rcs.append(m["recall"])
            p(f"{name:26s} labelled hours {hrs:3d}: false/h {mean_sd(fps)} recall {mean_sd(rcs)}")
    open("experiments/results.txt", "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
