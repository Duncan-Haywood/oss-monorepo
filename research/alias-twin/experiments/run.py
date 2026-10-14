"""Alias twin experiments.  Everything printed here is written to experiments/results.txt."""
import math
import random

from alias_twin.model import (scene, measure, ls, unfold_estimate, naive_bias, twin_rmse, confusion_energy,
                              pair_error_prob, wrapped_cost)

VU, SIGMA, N, FOV = 10.0, 0.1, 30, 60.0
TRIALS = 300


def rmse(errs):
    return math.sqrt(sum(e * e for e in errs) / len(errs))


def main():
    print("v_u = %.1f m/s, sigma = %.2f m/s, n = %d targets, azimuth uniform +-%d deg, %d trials per row\n" % (VU, SIGMA, N, FOV, TRIALS))

    print("1. Exact naive bias (noiseless, n = 4000 random azimuths, mean over 20 scenes) vs closed form")
    print("   v    closed-form    simulated")
    rng = random.Random(11)
    for v in (8.0, 10.0, 12.0, 15.0, 20.0, 30.0, 50.0):
        est = []
        for _ in range(20):
            c = scene(4000, FOV, rng)
            est.append(ls(measure(v, c, 0.0, VU, rng), c) - v)
        print("  %4.0f   %9.4f   %9.4f" % (v, naive_bias(v, FOV, VU), sum(est) / len(est)))

    print("\n2. Twin vs real RMSE of the naive estimator (folded vs unfolded measurements, same scenes and noise)")
    print("   v   twin-pred  twin-sim   real-naive   real-unfold   unfold-mode-errors")
    rng = random.Random(22)
    rows = []
    for v in (2, 5, 8, 9, 9.5, 9.8, 10, 10.5, 12, 15, 20, 30, 45, 60):
        et, er, eu, bad, pred = [], [], [], 0, []
        for _ in range(TRIALS):
            c = scene(N, FOV, rng)
            noise_state = rng.getstate()
            mt = measure(v, c, SIGMA, VU, rng, fold=False)
            rng.setstate(noise_state)
            mr = measure(v, c, SIGMA, VU, rng, fold=True)
            et.append(ls(mt, c) - v)
            er.append(ls(mr, c) - v)
            u = unfold_estimate(mr, c, VU, 70.0) - v
            eu.append(u)
            bad += abs(u) > 0.5
            pred.append(twin_rmse(c, SIGMA))
        rows.append((v, rmse(er)))
        print("  %4.1f  %8.4f  %8.4f   %10.4f   %11.4f   %d/%d" % (v, rmse(pred), rmse(et), rmse(er), rmse(eu), bad, TRIALS))
    cert = [v for v, r in rows if r > 0.05]
    print("   naive estimator exceeds RMSE 0.05 m/s from v = %s (twin: never)" % (cert[0] if cert else "none"))

    print("\n3. Mode confusion vs field of view: pairwise prediction Phi(-sqrt(E_1)/(2 sigma)) vs Monte Carlo of the two costs,")
    print("   and error rate of the full grid search (true v = 25 m/s; |v_hat - v| > 0.5 counts as a mode error)")
    print("   fov  E_1(mean)  D(mean)   pair-pred  pair-sim   grid-search-error")
    rng = random.Random(33)
    for fov in (3, 5, 8, 12, 20, 30, 60):
        Es, Ds, pp, ps, ge = [], [], [], [], 0
        T3 = 2000
        for t in range(T3):
            c = scene(N, fov, rng)
            E, D = confusion_energy(c, VU)
            m = measure(25.0, c, SIGMA, VU, rng)
            Es.append(E); Ds.append(D)
            pp.append(pair_error_prob(c, SIGMA, VU))
            ps.append(wrapped_cost(m, c, 25.0 + D, VU) <= wrapped_cost(m, c, 25.0, VU))
            if t < 300:
                ge += abs(unfold_estimate(m, c, VU, 70.0) - 25.0) > 0.5
        print("  %3d  %9.3f  %7.2f  %9.4f  %8.4f   %d/300" % (fov, sum(Es) / T3, sum(Ds) / T3, sum(pp) / T3, sum(ps) / T3, ge))

    print("\n4. Targets needed to unfold at a fixed FOV (+-20 deg, v = 25): grid-search mode-error rate vs n, pairwise prediction")
    print("    n   pair-pred   grid-search-error")
    rng = random.Random(44)
    for n in (5, 10, 20, 40, 80, 160):
        pp, ge, T4 = [], 0, 300
        for _ in range(T4):
            c = scene(n, 20.0, rng)
            pp.append(pair_error_prob(c, SIGMA, VU))
            m = measure(25.0, c, SIGMA, VU, rng)
            ge += abs(unfold_estimate(m, c, VU, 70.0) - 25.0) > 0.5
        print("  %3d   %8.4f   %d/%d" % (n, sum(pp) / T4, ge, T4))


if __name__ == "__main__":
    main()
