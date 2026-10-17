"""Experiments for noisy-local-sgd; output is committed as results.txt."""
import math
from noisy_local_sgd import *


def spec(kap, d=10):
    return [kap ** (-i / (d - 1)) for i in range(d)]


def main():
    print("== 1. exact floor vs literal simulation (a=[1,.3], eta=.4, sigma=1, M=3, H=5)")
    a = [1.0, 0.3]
    for al, be in ((0.8, 0.0), (0.3, 0.6), (0.1, 0.9)):
        th = floor(a, 0.4, 1.0, 3, 5, al, be)
        em = simulate(a, 0.4, 1.0, 3, 5, al, be, 40000, 500, seed=1)
        print(f"alpha={al} beta={be}: theory {th:.5f}  simulated {em:.5f}  ratio {em/th:.3f}")

    print("\n== 2. floor vs H at alpha=1 (invariant) and alpha=0.05 (falls to 1/(1+q) at most); kappa=100, M=1")
    a = spec(100)
    for H in (1, 4, 16, 64, 256):
        print(f"H={H:4d}: alpha=1 {floor(a,1.0,1.0,1,H,1.0):.5f}   alpha=.05 {floor(a,1.0,1.0,1,H,0.05):.6f}")

    print("\n== 3. momentum at equal effective step alpha_e=alpha/(1-beta), one mode s=0.4, V=0.01")
    for ae in (0.2, 1.0, 2.0, 3.5):
        row = [outer_var(0.4, 0.01, ae * (1 - b), b) for b in (0.0, 0.5, 0.9, 0.99)]
        print(f"alpha_e={ae}: " + "  ".join(f"beta={b}: {v:.5f}" for b, v in zip((0, .5, .9, .99), row)))

    print("\n== 4. workers M at a fixed floor eps=1e-2 (kappa=200, C=100, best H over a grid)")
    a = spec(200)
    Hs = sorted(set(int(1.5 ** k) for k in range(28)))
    t1 = None
    for M in (1, 2, 4, 8, 16, 64, 256):
        H, t, al = best_H(a, 1.0, 1.0, M, 100, 1e-2, Hs)
        t1 = t1 or t
        print(f"M={M:4d}: best H={H:4d} alpha={al:.4f} time={t:10.0f} speedup {t1/t:6.2f}x")

    print("\n== 5. best sync interval H* (grid) vs floor target; sigma=1, M=1, eta=1")
    Hs = sorted(set(int(1.5 ** k) for k in range(30)))
    for kap in (50, 200, 1000):
        a = spec(kap)
        for C in (10, 100):
            cells = []
            for eps in (1e-1, 1e-2, 1e-3):
                H, t, _ = best_H(a, 1.0, 1.0, 1, C, eps, Hs)
                cells.append(f"eps={eps:g}: H*={H:3d} ({wallclock(a,1.0,1.0,1,1,C,eps)[0]/t:5.1f}x vs H=1, {wallclock(a,1.0,1.0,1,C,C,eps)[0]/t:4.2f}x for H=C)")
            print(f"kappa={kap:5d} C={C:3d}: " + "; ".join(cells))


if __name__ == "__main__":
    main()
