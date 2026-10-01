"""Reproduces every number in paper/whitepaper.md (about 1-2 minutes, stdlib only)."""
import math
import random
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from rrt import *
from rrt.train import commit
from rrt.fp32 import f32
from rrt.stats import (sample_drift_pair, quantile, excess_kurtosis, hill,
                       gauss_tail_quantile)
from rrt.referee import linf


def exp1():
    print("== E1: reduction-order drift, canonical vs shuffled (units of u*sum|p| and u*|result|) ==")
    print("kind      n    | abs: q99.9  gaussfit  kurt | rel: median  q99.9  gaussfit  hill")
    for kind in ["positive", "gaussian"]:
        for n in [64, 512]:
            ab, rel = sample_drift_pair(kind, n, "canonical", "shuffled", 1500, seed=1)
            fin = [r for r in rel if r < 1e9]
            print("%-9s %4d |      %5.2f    %5.2f  %5.1f |      %5.2f  %7.1f  %7.1f  %5.2f" % (
                kind, n, quantile(ab, .999), gauss_tail_quantile(ab, .999), excess_kurtosis(ab),
                quantile(rel, .5), quantile(rel, .999), gauss_tail_quantile(fin, .999), hill(rel, 75)))
    print("canonical vs canonical (RepOps, any 'hardware'): max drift =",
          max(sample_drift_pair("gaussian", 512, "canonical", "canonical", 300)[0]))


def one_step_drift(prob, states, order, rng):
    return [linf(states[i], step(prob, states[i - 1], order, rng)) for i in range(1, len(states))]


def exp2():
    print("\n== E2: honest false-slash rate vs tolerance tau (T=40 steps, 100 problems) ==")
    drifts, free_run, hash_dispute = [], [], 0
    for seed in range(100):
        prob = Problem.synthetic(seed=seed)
        rng = random.Random(seed)
        ref = run_trace(prob, 40, "canonical")
        other = run_trace(prob, 40, "shuffled", rng)
        hash_dispute += int(other != ref)
        free_run.append(linf(ref[-1], other[-1]))
        drifts += one_step_drift(prob, ref, "shuffled", rng)
    u = 2.0 ** -24
    print("bitwise commitments: honest 'shuffled' hardware disagrees with canonical trace in %d/100 runs" % hash_dispute)
    print("one-step linf drift (units of u): median %.1f  q99 %.1f  q99.9 %.1f  max %.1f  kurt %.1f" % (
        quantile(drifts, .5) / u, quantile(drifts, .99) / u, quantile(drifts, .999) / u,
        max(drifts) / u, excess_kurtosis(drifts)))
    print("free-running final-state drift (units of u): median %.1f max %.1f" % (
        quantile(free_run, .5) / u, max(free_run) / u))
    rms = math.sqrt(sum(d * d for d in drifts) / len(drifts))
    print("tau (units of u) | empirical false-slash per step | gaussian(rms-matched) prediction")
    for t in [0.5, 1, 2, 4, 8, 16]:
        emp = sum(d > t * u for d in drifts) / len(drifts)
        gau = math.erfc(t * u / rms / math.sqrt(2))
        print("   %5.1f         |   %.5f                    |   %.5f" % (t, emp, gau))
    return drifts


def exp3():
    print("\n== E3: cumulative hidden deviation under a per-step tolerance ==")
    prob = Problem.synthetic(seed=3)
    T = 400
    honest = run_trace(prob, T, "canonical")
    print("  contraction bound: delta/(lr*mu) = %.1f * delta" % (1 / (prob.lr * prob.mu)))
    print("  delta(per-step bias) | final deviation | bound delta/(lr*mu) | verifier(tau=1.05*delta, other order) flags?")
    for delta in [1e-6, 1e-5, 1e-4, 1e-3]:
        w = [0.0] * 8
        states = [w]
        for _ in range(T):
            w = step(prob, w, "canonical")
            w = [w[0] + delta] + w[1:]      # hidden per-step bias in one coordinate
            w = [f32(v) for v in w]
            states.append(w)
        dev = linf(states[-1], honest[-1])
        tree = commit(states)
        claim = verifier_find_violation(prob, states, tree, 1.05 * delta, "pairwise")
        print("  %8.0e             |  %.3e      |  %.3e           | %s" % (
            delta, dev, delta / (prob.lr * prob.mu), "yes" if claim else "no"))


def exp4():
    print("\n== E4: single-step cheat detection, tau=0 (RepOps) vs tau=drift q99.9 (mixed hardware) ==")
    prob = Problem.synthetic(seed=5)
    T = 30
    u = 2.0 ** -24
    honest = run_trace(prob, T, "canonical")
    rng = random.Random(7)
    tau = 4 * u   # about the measured one-step q99.9 (E2)
    print("  cheat size (units of u) | caught tau=0 same order | caught tau=4u mixed hardware")
    for c in [0.0, 1, 2, 4, 8, 64]:
        caught0 = caughtT = 0
        for j in range(1, 21):
            s = [list(v) for v in honest]
            s[j] = [f32(s[j][0] + c * u)] + s[j][1:]
            for k in range(j + 1, T + 1):     # solver keeps computing honestly from its own state
                s[k] = step(prob, s[k - 1], "canonical")
            tree = commit(s)
            cl = verifier_find_violation(prob, s, tree, 0.0, "canonical")
            caught0 += bool(cl and referee_check(prob, tree.root, cl, 0.0, "canonical"))
            cl = verifier_find_violation(prob, s, tree, tau, "shuffled", rng)
            caughtT += bool(cl and referee_check(prob, tree.root, cl, tau, "canonical"))
        print("       %5.1f            |      %2d/20             |      %2d/20" % (c, caught0, caughtT))


if __name__ == "__main__":
    exp1(); exp2(); exp3(); exp4()
