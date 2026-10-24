"""Truth tables, NPN classes and exact minimum circuit size of 4-input functions.

A function is a 16-bit int: bit t is f(x) for the input x = t, with variable i the
i-th bit of t. Cost is the fewest 2-input gates (any of the 16 gate types, so
inverters are free, as in Knuth, TAOCP 7.1.2) in a circuit computing f.
"""
N = 4
ROWS = 1 << N
FULL = (1 << ROWS) - 1
VAR = [sum(1 << t for t in range(ROWS) if (t >> i) & 1) for i in range(N)]


def apply_npn(f, perm, neg_in, neg_out):
    """g(x) = f(y) ^ neg_out where y_i = x_{perm[i]} ^ neg_in_i."""
    g = 0
    for t in range(ROWS):
        y = 0
        for i in range(N):
            y |= (((t >> perm[i]) & 1) ^ ((neg_in >> i) & 1)) << i
        g |= (((f >> y) & 1) ^ neg_out) << t
    return g


def _perms():
    import itertools
    return list(itertools.permutations(range(N)))


def npn_classes():
    """Map each of the 65536 functions to its class representative (smallest member)."""
    rep = [-1] * (FULL + 1)
    classes = {}
    ops = [(p, ni, no) for p in _perms() for ni in range(ROWS) for no in (0, 1)]
    for f in range(FULL + 1):
        if rep[f] >= 0:
            continue
        orbit = {apply_npn(f, p, ni, no) for p, ni, no in ops}
        r = min(orbit)
        for g in orbit:
            rep[g] = r
        classes[r] = len(orbit)
    return rep, classes


def _solver_cls():
    from pysat.solvers import Cadical153
    return Cadical153


def exists(target, r):
    """SAT: is there a circuit of exactly r gates (gates may be unused) computing target or its complement?"""
    if r == 0:
        return target in (0, FULL) or any(target in (v, FULL ^ v) for v in VAR)
    if target & 1:
        target ^= FULL  # normal form: f(0..0) = 0; gate types below are all normal
    cnt = [0]

    def new():
        cnt[0] += 1
        return cnt[0]

    clauses = []
    nsig = N + r
    x = {}  # (signal, row) -> var for rows 1..15
    for i in range(N, nsig):
        for t in range(1, ROWS):
            x[i, t] = new()
    lit = {}

    def val(i, t, a):
        """Literal asserting signal i has value a at row t (constant for inputs); returns True/False/int."""
        if i < N:
            return ((t >> i) & 1) == a
        v = x[i, t]
        return v if a else -v

    fb = {}
    sel = {}
    for i in range(N, nsig):
        for b in (1, 2, 3):  # f(a,b) for index a*? : bit k=2*a'+b' of f ; k=0 fixed 0
            fb[i, b] = new()
        pairs = [(j, k) for k in range(i) for j in range(k)]
        for j, k in pairs:
            sel[i, j, k] = new()
        clauses.append([sel[i, j, k] for j, k in pairs])
        for p in range(len(pairs)):
            for q in range(p + 1, len(pairs)):
                clauses.append([-sel[i, *pairs[p]], -sel[i, *pairs[q]]])
        for (j, k) in pairs:
            s = sel[i, j, k]
            for t in range(1, ROWS):
                for a in (0, 1):
                    for b in (0, 1):
                        idx = 2 * a + b
                        base = [-s]
                        for sig, v in ((j, a), (k, b)):
                            l = val(sig, t, 1 - v)  # literal true when sig != v
                            if l is True:
                                base = None
                                break
                            if l is not False:
                                base.append(l)
                        if base is None:
                            continue
                        out = x[i, t]
                        if idx == 0:
                            clauses.append(base + [-out])
                        else:
                            clauses.append(base + [-out, fb[i, idx]])
                            clauses.append(base + [out, -fb[i, idx]])
        # a non-trivial gate: not constant, depends on both inputs is enforced by minimality
    for t in range(1, ROWS):
        o = x[nsig - 1, t]
        clauses.append([o] if (target >> t) & 1 else [-o])
    # every non-final gate feeds a later gate
    for i in range(N, nsig - 1):
        clauses.append([sel[m, j, k] for m in range(i + 1, nsig) for k in range(m) for j in range(k) if i in (j, k)])
    with _solver_cls()(bootstrap_with=clauses) as s:
        return s.solve()


def cost(f, upper=8):
    for r in range(upper + 1):
        if exists(f, r):
            return r
    raise ValueError("cost above bound")
