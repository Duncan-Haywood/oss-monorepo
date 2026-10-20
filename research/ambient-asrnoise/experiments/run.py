"""Experiments for ambient-asrnoise. Output: experiments/results.txt (deterministic, seeded)."""
from dataclasses import replace

import numpy as np

from ambient_asrnoise.sim import (World, score_policy, simulate, speak_acoustic, speak_keyword,
                                  speak_text, speak_wake, tune)

SEEDS, TRAIN_H, TEST_H = 20, 20, 200
GRID = np.linspace(-1, 7, 321)
WERS = (0.0, 0.1, 0.2, 0.3, 0.4, 0.5)
BUDGET = 2.0


def ms(xs):
    return f"{np.mean(xs):.3f} +- {np.std(xs):.3f}"


def run(world, wer, tuned_at=None, budget=BUDGET):
    """Per-policy lists of (recall, false/h). tuned_at: wer the thresholds were tuned at (default: wer)."""
    tw = wer if tuned_at is None else tuned_at
    out = {k: [] for k in ("wake", "keyword", "text", "acoustic")}
    for s in range(SEEDS):
        tr = simulate(world, tw, TRAIN_H, np.random.default_rng(s))
        te = simulate(world, wer, TEST_H, np.random.default_rng(1000 + s))
        tt, ta = tune(tr, "text", budget, GRID), tune(tr, "acoustic", budget, GRID)
        for k, m in (("wake", speak_wake(te)), ("keyword", speak_keyword(te)),
                     ("text", speak_text(te, tt)), ("acoustic", speak_acoustic(te, ta))):
            r = score_policy(te, m); out[k].append((r["recall"], r["fp_per_hour"]))
    return {k: np.array(v) for k, v in out.items()}


def main():
    o = []; p = o.append
    w = World()
    p(f"world: prevalence {w.prevalence}, transcript d' {w.d_prime} x (1-wer)^{w.k}, acoustic d' {w.d_acoustic}, "
      f"wake {w.wake_words} words, keyword p {w.p_kw_need}/{w.p_kw_other}; budget {BUDGET} false/h; "
      f"{SEEDS} seeds, train {TRAIN_H} h, test {TEST_H} h")
    p("")
    p("== 1. Recall at equal annoyance (thresholds re-tuned at each wer) and false/h of the fixed rules ==")
    for wer in WERS:
        r = run(w, wer)
        p(f"wer {wer:.1f}: wake recall {ms(r['wake'][:,0])} ({r['wake'][:,1].mean():.2f}/h)  "
          f"keyword recall {ms(r['keyword'][:,0])} ({r['keyword'][:,1].mean():.2f}/h)  "
          f"text-threshold recall {ms(r['text'][:,0])}  acoustic recall {ms(r['acoustic'][:,0])}")
    p("")
    p(f"== 2. Threshold tuned at wer 0, deployed at higher wer (false/h should stay {BUDGET}) ==")
    for wer in WERS[1:]:
        r = run(w, wer, tuned_at=0.0)
        p(f"wer {wer:.1f}: text-threshold recall {ms(r['text'][:,0])} false/h {ms(r['text'][:,1])}")
    p("")
    p("== 3. Where does the acoustic policy overtake the transcript policy? (re-tuned recall difference text - acoustic) ==")
    for k in (1.0, 2.0):
        for da in (0.8, 1.2):
            wk = replace(w, k=k, d_acoustic=da)
            row = []
            for wer in WERS:
                r = run(wk, wer)
                row.append(f"{wer:.1f}:{r['text'][:,0].mean() - r['acoustic'][:,0].mean():+.3f}")
            p(f"k={k:.0f} acoustic d'={da}: " + "  ".join(row))
    p("")
    p("== 4. Budget sensitivity at wer 0.3 (recall) ==")
    for b in (0.5, 1.0, 2.0, 4.0):
        r = run(w, 0.3, budget=b)
        p(f"budget {b:3.1f}/h: text {ms(r['text'][:,0])}  acoustic {ms(r['acoustic'][:,0])}")
    open("experiments/results.txt", "w").write("\n".join(o) + "\n")
    print("\n".join(o))


if __name__ == "__main__":
    main()
