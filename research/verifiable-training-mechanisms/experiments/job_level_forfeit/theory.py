"""Milestone 83 theory: job-level forfeiture under simple random sampling (SRS) of k of N segments.

Worker stalls a set of m segments, saving g each. Each opened stalled segment is detected independently with
probability d. If any is detected the worker forfeits F (bond plus withheld fee) and the job is rejected openly.
  p_srs(m)  = 1 - E[(1-d)^X],  X ~ Hypergeometric(N, m, k)
Claim: p_srs is concave in m, so g m - F p(m) is convex and the best response is m in {0, N}:
  deterred  iff  F >= g N / (1 - (1-d)^k).
Necessity for any design: the stall-everything deviation is caught with probability 1 - E[(1-d)^K] <= 1 - (1-d)^E[K].
Alternatives computed alongside:
  Poisson    each segment opened independently with probability k/N: p(m) = 1 - (1 - d k/N)^m
  systematic one of N/k residue classes opened (k | N): stall n_r segments in class r, p = (1/L) sum_r (1-(1-d)^n_r)
  additive   per-segment fine f, linear payoff: deterred iff f d k / N >= g; worst realised fine k f = g N / d.
Run: python3 theory.py   (stdlib only). Prints the checks; imported by analyze.py and the tests."""
from math import comb


def p_srs(N, k, m, d):
    """Probability that at least one of m stalled segments is opened and detected under SRS."""
    if m == 0 or k == 0:
        return 0.0
    tot = comb(N, k)
    miss = 0.0
    for x in range(max(0, k - (N - m)), min(k, m) + 1):
        miss += comb(m, x) * comb(N - m, k - x) / tot * (1 - d) ** x
    return 1.0 - miss


def p_poisson(N, k, m, d):
    return 1.0 - (1 - d * k / N) ** m


def best_response(N, k, d, F, g=1.0, p=p_srs):
    """Worker's payoff-maximising number of stalled segments (ties to fewer). Exact over m = 0..N."""
    best_m, best_v = 0, 0.0
    for m in range(1, N + 1):
        v = g * m - F * p(N, k, m, d)
        if v > best_v + 1e-12:
            best_m, best_v = m, v
    return best_m, best_v


def threshold_srs(N, k, d, g=1.0):
    return g * N / (1 - (1 - d) ** k)


def threshold_poisson(N, k, d, g=1.0):
    """Smallest F deterring every m under Poisson: payoff convex, so the binding deviation is m = N."""
    return g * N / p_poisson(N, k, N, d)


def escrow_additive(N, k, d, g=1.0):
    return g * N / d


def concavity_check(Nmax=120, ds=(0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1.0)):
    """Second differences of p_srs(m) over every N <= Nmax, k <= N, m; returns (points checked, worst violation)."""
    pts, worst = 0, 0.0
    for N in range(2, Nmax + 1):
        for k in range(1, N + 1):
            for d in ds:
                ps = [p_srs(N, k, m, d) for m in range(N + 1)]
                for m in range(1, N):
                    sd = ps[m + 1] - 2 * ps[m] + ps[m - 1]
                    pts += 1
                    worst = max(worst, sd)
    return pts, worst


def main():
    pts, worst = concavity_check()
    print(f"concavity of p_srs(m): {pts} second differences checked (N 2-120, every k, 8 values of d);"
          f" largest {worst:+.2e} (concave iff <= 0 up to rounding)")
    N = 75
    print("thresholds at N = 75 (F/g that deters every stall set; additive escrow = worst realised fine k f)")
    print("    k     d   SRS/sys  Poisson  additive-escrow  job/additive")
    rows = []
    for k in (1, 2, 5, 10, 20):
        for d in (1.0, 0.5, 0.2, 0.1):
            s, po, a = threshold_srs(N, k, d), threshold_poisson(N, k, d), escrow_additive(N, k, d)
            rows.append((k, d, s, po, a))
            print(f"  {k:3d} {d:5.2f} {s:9.1f} {po:8.1f} {a:15.1f}  {s / a:6.3f}")
    # brute-force best responses agree with the threshold
    bad = 0
    for k in (1, 2, 5, 10):
        for d in (1.0, 0.5, 0.2):
            th = threshold_srs(N, k, d)
            for F in (0.5 * th, 0.9 * th, 0.999 * th, 1.001 * th, 2 * th):
                m, _ = best_response(N, k, d, F)
                want = N if F < th else 0
                bad += m != want
    print(f"brute-force best response matches {{0 if F >= threshold else N}}: {60 - bad} of 60 cases")
    return {"concavity_points": pts, "concavity_worst": worst, "mismatch": bad, "rows": rows}


if __name__ == "__main__":
    main()
