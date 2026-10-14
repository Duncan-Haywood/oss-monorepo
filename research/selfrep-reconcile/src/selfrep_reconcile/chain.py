"""Fleet-size birth-death chains with different birth-rate laws (stylised), for comparison with the kit-stock chain.

The chain of ``selfrep-extinction`` uses b(n) = min(n/W, a): each machine builds at rate 1/W and the kit stream a = B/V
caps the total. That is the envelope of what two shared resources (machines and kits) can deliver. The law
``serial`` below, b(n) = 1 / (W/n + 1/a), adds the two waiting times instead (a machine builds for W hours on average,
then waits 1/a for a kit when it is alone). It was written down before looking at the numbers.
"""


def birth_min(n, w, a):
    return min(n / w, a) if n > 0 else 0.0


def birth_serial(n, w, a):
    return 1.0 / (w / n + 1.0 / a) if n > 0 else 0.0


def mean_extinction(birth, w, a, l, nmax=200):
    """Exact E[time to 0 from n], n = 0..nmax, for deaths n/l and births ``birth(n, w, a)`` (none at nmax)."""
    b = [birth(n, w, a) for n in range(nmax + 1)]
    b[nmax] = 0.0
    d = [n / l for n in range(nmax + 1)]
    m = nmax
    di = [b[n] + d[n] for n in range(1, m + 1)]
    up = [-b[n] for n in range(1, m + 1)]
    lo = [-d[n] for n in range(1, m + 1)]
    rhs = [1.0] * m
    for i in range(1, m):
        r = lo[i] / di[i - 1]
        di[i] -= r * up[i - 1]
        rhs[i] -= r * rhs[i - 1]
    t = [0.0] * (m + 1)
    t[m] = rhs[m - 1] / di[m - 1]
    for i in range(m - 2, -1, -1):
        t[i + 1] = (rhs[i] - up[i] * t[i + 2]) / di[i]
    return t
