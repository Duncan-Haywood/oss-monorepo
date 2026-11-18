"""Finite-size scaling of Axelrod's order-disorder transition (milestone 4 follow-up).

Runs src/civ_levers/axelrod.c (same rule as culture.py, ~1000x faster) over q at
several lattice sizes L and F in {3, 10}; prints the mean largest-region fraction S
per cell and q_half(L), the q where S crosses 0.5 (linear interpolation), with a
bootstrap interval over runs. Usage: python3 scaling.py [--quick]
"""
import os
import random
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "src", "civ_levers", "axelrod.c")
EXE = os.path.join(tempfile.gettempdir(), "civ_axelrod")
TIMEOUT = 900


def build():
    subprocess.run(["gcc", "-O2", "-o", EXE, SRC, "-lm"], check=True)


POISSON = "--poisson" in sys.argv


def cell(L, F, q, runs, seed):
    try:
        out = subprocess.run([EXE, str(L), str(F), str(q), str(seed), str(runs)] + (["poisson"] if POISSON else []),
                             capture_output=True, text=True, timeout=TIMEOUT).stdout
    except subprocess.TimeoutExpired:
        return None
    rows = [ln.split() for ln in out.strip().splitlines()]
    return [(float(r[0]), int(r[1]), int(r[2])) for r in rows] or None


def mean(x):
    return sum(x) / len(x)


def cross(qs, ss, level=0.5):
    for q0, s0, q1, s1 in zip(qs, ss, qs[1:], ss[1:]):
        if s0 >= level > s1:
            return q0 + (s0 - level) / (s0 - s1) * (q1 - q0)
    return None


def main():
    quick = "--quick" in sys.argv
    runs = 8 if quick else 40
    q3 = [4, 8, 10, 12, 14, 16, 18, 20, 24, 30]
    q10 = [20, 30, 40, 50, 60, 80, 120, 200, 300, 400]
    if POISSON:  # traits ~ Poisson(q) as in Castellano et al. (2000); F = 10 only
        qp = [100, 150, 200, 250, 300, 350, 400, 500]
        plan = {(10, 20): qp, (10, 40): qp, (10, 80): qp}
    else:
      plan = {(3, 16): q3, (3, 32): q3, (3, 64): q3,
            (10, 20): q10, (10, 40): q10, (10, 80): q10}
    build()
    jobs = [(F, L, q) for (F, L), qs in plan.items() for q in qs]
    with ThreadPoolExecutor(max_workers=os.cpu_count()) as ex:
        res = dict(zip(jobs, ex.map(lambda j: cell(j[1], j[0], j[2], runs, 1000 + j[2]), jobs)))
    rng = random.Random(0)
    print(f"runs per cell: {runs}; S = largest region / L^2; '-' = timed out at {TIMEOUT}s")
    for (F, L), qs in plan.items():
        got = [(q, res[(F, L, q)]) for q in qs if res[(F, L, q)] is not None]
        print(f"F={F} L={L}  " + " ".join(
            f"q{q}:" + (f"{mean([a for a, _, _ in r]):.2f}" if r else "-")
            for q, r in ((q, res[(F, L, q)]) for q in qs)))
        qh = cross([q for q, _ in got], [mean([a for a, _, _ in r]) for _, r in got])
        bs = []
        for _ in range(200):
            ss = [mean([rng.choice(r)[0] for _ in r]) for _, r in got]
            c = cross([q for q, _ in got], ss)
            if c is not None:
                bs.append(c)
        bs.sort()
        ci = f"[{bs[int(.025 * len(bs))]:.1f}, {bs[int(.975 * len(bs))]:.1f}]" if len(bs) > 20 else "n/a"
        print(f"   q_half = {None if qh is None else round(qh, 1)}  95% bootstrap {ci}")


if __name__ == "__main__":
    main()
