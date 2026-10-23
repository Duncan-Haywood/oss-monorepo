"""Population-balance ball mill (Austin / Klimpel / Luckie form) with an optional classifier loop.

Size classes run on a sqrt(2) ladder from `top` micrometres downward; class 0 is the coarsest.
Selection S_i is per unit specific energy (t/kWh), so a mill pass is described by its specific
energy E (kWh/t through that mill) and the energy ratios between circuits do not depend on the
overall scale of S. All shape parameters are defaults to be swept, not measurements."""
import math

DEFAULTS = {
    "n": 26, "top": 2000.0,        # classes and top size (um)
    "S1": 0.35, "alpha": 0.9,      # S_i = S1 (x_i/1000um)^alpha, t/kWh
    "phi": 0.4, "gamma": 0.8, "beta": 3.5,   # Austin primary-breakage function
    "tanks": 3,                    # perfectly mixed tanks in series (plug-flow-ness)
    "feed_d80": 1500.0, "feed_m": 1.0,       # Rosin-Rammler feed
    "xfine": 0.0, "kfine": 2.0,    # fines slowing: S_i divided by 1+(xfine/x_i)^kfine (0 = off)
    "sharp": 4.0, "bypass": 0.1,   # classifier (Whiten) sharpness, fines bypass to coarse
}


def sizes(p):
    # x[i] = upper size of class i
    return [p["top"] / (2 ** (0.5 * i)) for i in range(p["n"])]


def mean_size(x, i, n):
    lo = x[i + 1] if i + 1 < n else x[i] / math.sqrt(2)
    return math.sqrt(x[i] * lo)


def feed(p):
    x = sizes(p)
    # Rosin-Rammler cumulative passing F(x)=1-exp(-(x/x0)^m), x0 from d80
    m = p["feed_m"]
    x0 = p["feed_d80"] / (-math.log(0.2)) ** (1 / m)
    cum = [1 - math.exp(-(xi / x0) ** m) if xi < p["top"] else 1.0 for xi in x]
    cum = [min(c, 1.0) for c in cum]
    cum[0] = 1.0
    f = [cum[i] - (cum[i + 1] if i + 1 < p["n"] else 0.0) for i in range(p["n"])]
    s = sum(f)
    return [v / s for v in f]


def selection(p):
    x = sizes(p)
    S = [p["S1"] * (mean_size(x, i, p["n"]) / 1000.0) ** p["alpha"] for i in range(p["n"])]
    if p.get("xfine", 0.0) > 0:  # cushioning / slurry effects slow fine particles
        xs = sizes(p)
        S = [S[i] / (1 + (p["xfine"] / mean_size(xs, i, p["n"])) ** p["kfine"]) for i in range(p["n"])]
    S[-1] = 0.0  # the finest class is a sink: there is no finer class to receive its progeny
    return S


def breakage(p):
    """b[i][j]: fraction of class j broken that lands in class i (i>j)."""
    n, x = p["n"], sizes(p)
    def cumB(i, j):  # mass fraction of progeny of j finer than upper size of class i
        r = x[i] / x[j]
        r = min(r, 1.0)
        return p["phi"] * r ** p["gamma"] + (1 - p["phi"]) * r ** p["beta"]
    b = [[0.0] * n for _ in range(n)]
    for j in range(n - 1):
        for i in range(j + 1, n):
            lo = cumB(i + 1, j) if i + 1 < n else 0.0
            b[i][j] = cumB(i, j) - lo
        s = sum(b[i][j] for i in range(j + 1, n))
        for i in range(j + 1, n):
            b[i][j] /= s  # remaining mass below the last class stays in it
    return b


def mill_pass(f, E, p, _cache={}):
    """Steady-state product of `tanks` perfectly mixed tanks sharing specific energy E (kWh/t).
    Each tank solves p = f - e S p + e B S p, lower-triangular because breakage only makes finer
    classes, so it is forward substitution."""
    key = tuple(sorted((k, v) for k, v in p.items() if k in ("n", "top", "S1", "alpha", "phi", "gamma", "beta", "xfine", "kfine")))
    if key not in _cache:
        _cache[key] = (selection(p), breakage(p))
    S, b = _cache[key]
    n, T = p["n"], p["tanks"]
    e = E / T
    out = f
    for _ in range(T):
        q = [0.0] * n
        for i in range(n):
            acc = out[i]
            for j in range(i):
                acc += e * b[i][j] * S[j] * q[j]
            q[i] = acc / (1 + e * S[i])
        out = q
    return out


def percentile_size(w, p, q=0.8):
    """Size (um) with fraction q passing, log-linear interpolation of the cumulative passing."""
    x = sizes(p)
    n = p["n"]
    passing = [sum(w[i + 1:]) if i + 1 < n else 0.0 for i in range(n)]  # passing upper size of class i+1 ... below x[i+1]
    # cumulative passing at size x[i+1]: mass in classes >= i+1
    pts = [(x[i + 1] if i + 1 < n else x[i] / math.sqrt(2), sum(w[i + 1:])) for i in range(n)]
    pts.sort()
    pts = [(s, c) for s, c in pts]
    for k in range(len(pts) - 1):
        (s0, c0), (s1, c1) = pts[k], pts[k + 1]
        if c0 <= q <= c1 and c1 > c0:
            t = (q - c0) / (c1 - c0)
            return math.exp(math.log(s0) + t * (math.log(s1) - math.log(s0)))
    return pts[-1][0] if q > pts[-1][1] else pts[0][0]


def classifier_coarse(p, d50):
    """Fraction of each class reporting to the coarse (return) stream: Whiten efficiency curve + bypass."""
    a = p["sharp"]
    out = []
    for i, xi in enumerate(sizes(p)):
        d = mean_size(sizes(p), i, p["n"]) / d50
        ec = (math.exp(a * d) - 1) / (math.exp(a * d) + math.exp(a) - 2)
        out.append(p["bypass"] + (1 - p["bypass"]) * ec)
    return out


def open_circuit(E, p=None):
    p = {**DEFAULTS, **(p or {})}
    prod = mill_pass(feed(p), E, p)
    return {"product": prod, "p80": percentile_size(prod, p), "energy": E}


def closed_circuit(E_pass, d50, p=None, iters=400):
    """Mill in closed loop with a classifier; E_pass is kWh per tonne through the mill.
    Returns product, P80, circulating load (return / fresh feed) and kWh per tonne of fresh feed."""
    p = {**DEFAULTS, **(p or {})}
    f = feed(p)
    C = classifier_coarse(p, d50)
    ret = [0.0] * p["n"]
    for _ in range(iters):
        mill_feed = [f[i] + ret[i] for i in range(p["n"])]
        out = mill_pass(mill_feed, E_pass, p)  # mill_feed has mass 1+CL; linear model
        new = [out[i] * C[i] for i in range(p["n"])]
        if max(abs(new[i] - ret[i]) for i in range(p["n"])) < 1e-13:
            ret = new
            break
        ret = new
    prod = [out[i] * (1 - C[i]) for i in range(p["n"])]
    s = sum(prod)
    prod = [v / s for v in prod]
    cl = sum(ret)
    return {"product": prod, "p80": percentile_size(prod, p), "circ_load": cl, "energy": E_pass * (1 + cl)}


def _bisect(fn, lo, hi, target, it=60):
    # fn decreasing in its argument (p80 falls as energy rises)
    for _ in range(it):
        mid = math.sqrt(lo * hi)
        if fn(mid) > target:
            lo = mid
        else:
            hi = mid
    return math.sqrt(lo * hi)


def energy_open(target_p80, p=None):
    return _bisect(lambda E: open_circuit(E, p)["p80"], 1e-3, 1e4, target_p80)


def energy_closed(target_p80, cut_ratio, p=None):
    """Energy per fresh tonne for a closed circuit whose classifier cut is cut_ratio x the target P80."""
    d50 = cut_ratio * target_p80
    E = _bisect(lambda e: closed_circuit(e, d50, p)["p80"], 1e-3, 1e4, target_p80)
    r = closed_circuit(E, d50, p)
    r["E_pass"] = E
    r["cut_ratio"] = cut_ratio
    return r


def bond_energy(wi, p80, f80):
    """Bond's third theory, kWh/t: W = 10 Wi (1/sqrt(P80) - 1/sqrt(F80)), sizes in um."""
    return 10 * wi * (1 / math.sqrt(p80) - 1 / math.sqrt(f80))


def capacity_ratio(E_open, closed, m):
    """Fresh-feed capacity of a closed circuit relative to open, in one mill of fixed power and a
    mill-flow limit of m times the open circuit's fresh feed (open circuit passes only fresh feed).
    Power limit: E_open / E_fresh_closed. Flow limit: m / (1 + circulating load). The smaller binds."""
    return min(E_open / closed["energy"], m / (1 + closed["circ_load"]))
