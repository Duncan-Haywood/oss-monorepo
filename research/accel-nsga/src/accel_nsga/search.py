"""NSGA-II against random search, at equal evaluation budgets, on a co-design space with a known exact front (stylised).

Model side: the 40 measured accel-kws models (3-seed validation accuracy, P=1 cells, modelled energy).
Hardware side, four knobs: MAC lanes P, weight-memory banks B, supply level V (index), and the model.
Everything beyond accel-codesign's lane count is an ASSUMED analytic model, not a synthesis or measurement:
  - bank bandwidth: B banks feed B weights per cycle, so effective lanes = min(P, B);
  - each extra bank costs BANK_CELLS generic cells (assumed constant);
  - supply level scales energy by V^2 and clock by F_REL (assumed, 45 nm-style first-order DVFS).
Latency = cycles / (F_REL[v] * F_NOM). Objectives: maximise validation accuracy, minimise area, energy;
constraint: latency <= deadline.
"""
import json, math, os, random

OUT = 11
LANES = (1, 2, 4, 8, 16, 32)
BANKS = (1, 2, 4, 8)
VOLT = (1.0, 0.9, 0.8, 0.7)          # relative supply
F_REL = (1.0, 0.8, 0.6, 0.4)         # relative clock at that supply (assumed)
F_NOM = 100e6                        # nominal clock, Hz (assumed)
BANK_CELLS = 60                      # assumed generic cells per extra bank
HERE = os.path.dirname(os.path.abspath(__file__))
KWS = os.path.join(HERE, "..", "..", "..", "accel-kws", "experiments", "results.json")
DP = os.path.join(HERE, "..", "..", "..", "accel-codesign", "experiments", "datapath_area.json")


def load_models():
    rows = json.load(open(KWS))["rows"]
    return [dict(seg=r["segments"], inputs=r["inputs"], hidden=r["hidden"], wbits=r["wbits"], val=r["val_mean"],
                 test=r["test_mean"], cells1=r["cells"], energy=r["energy_nj"]) for r in rows]


def load_dp():
    return json.load(open(DP))["cells"]


class Space:
    """A design is a gene tuple (model index, lane index, bank index, voltage index)."""

    def __init__(self, models, dp, deadline_us):
        self.models, self.dp, self.deadline_us = models, dp, deadline_us
        self.dims = (len(models), len(LANES), len(BANKS), len(VOLT))
        self.cache = {}

    def size(self):
        return math.prod(self.dims)

    def all_genes(self):
        return [(m, p, b, v) for m in range(self.dims[0]) for p in range(self.dims[1])
                for b in range(self.dims[2]) for v in range(self.dims[3])]

    def evaluate(self, g):
        if g in self.cache:
            return self.cache[g]
        m, p, b, v = g
        md, P, B = self.models[m], LANES[p], BANKS[b]
        eff = min(P, B)
        cyc = math.ceil(md["inputs"] * md["hidden"] / eff) + math.ceil(md["hidden"] * OUT / eff) + 3
        lat = cyc / (F_REL[v] * F_NOM) * 1e6
        dp = self.dp[str(md["wbits"])]
        area = md["cells1"] + dp[str(P)] - dp["1"] + BANK_CELLS * (B - 1)
        res = dict(val=md["val"], test=md["test"], area=area, energy=md["energy"] * VOLT[v] ** 2,
                   cyc=cyc, lat_us=lat, ok=lat <= self.deadline_us)
        self.cache[g] = res
        return res


def dominates(a, b):
    """Constrained domination (Deb 2002): feasible beats infeasible; infeasible ranked by latency."""
    if a["ok"] != b["ok"]:
        return a["ok"]
    if not a["ok"]:
        return a["lat_us"] < b["lat_us"]
    ge = a["val"] >= b["val"] and a["area"] <= b["area"] and a["energy"] <= b["energy"]
    gt = a["val"] > b["val"] or a["area"] < b["area"] or a["energy"] < b["energy"]
    return ge and gt


def pareto_set(items):
    """items: list of (key, result). Feasible non-dominated, one entry per distinct objective vector kept."""
    feas = [(k, r) for k, r in items if r["ok"]]
    out, seen = [], set()
    for k, r in feas:
        if any(dominates(r2, r) for _, r2 in feas):
            continue
        sig = (r["val"], r["area"], r["energy"])
        if sig not in seen:
            seen.add(sig)
            out.append((k, r))
    return out


def hypervolume(points, ref):
    """Exact 3-D hypervolume of points (val max, area min, energy min), points as (val, area, energy), vs ref
    (val_ref, area_ref, energy_ref) = worst corner. Slicing over val."""
    pts = [p for p in points if p[0] > ref[0] and p[1] < ref[1] and p[2] < ref[2]]
    if not pts:
        return 0.0
    pts.sort(key=lambda p: -p[0])
    hv, prev = 0.0, None
    for i, p in enumerate(pts):
        nxt = pts[i + 1][0] if i + 1 < len(pts) else ref[0]
        depth = p[0] - nxt
        if depth <= 0:
            continue
        hv += depth * area2d([(q[1], q[2]) for q in pts[:i + 1]], ref[1], ref[2])
    return hv


def area2d(pts, ra, re):
    pts = sorted(set(pts))
    hv, best_e = 0.0, re
    for a, e in pts:
        if e < best_e:
            hv += (ra - a) * (best_e - e)
            best_e = e
    return hv


def objective_hv(items, ref):
    """Hypervolume with area and energy divided by their reference values, so the three axes weigh equally."""
    pts = [(r["val"], r["area"] / ref[1], r["energy"] / ref[2]) for _, r in pareto_set(items)]
    return hypervolume(pts, (ref[0], 1.0, 1.0))


def random_search(space, budget, rng):
    genes = rng.sample(space.all_genes(), budget)
    return [(g, space.evaluate(g)) for g in genes]


def _rank_and_crowd(pop, space):
    """Non-dominated sorting plus crowding distance over feasible members; returns pop ordered best-first."""
    rs = {g: space.evaluate(g) for g in pop}
    left, fronts = list(pop), []
    while left:
        f = [g for g in left if not any(dominates(rs[h], rs[g]) for h in left if h != g)]
        if not f:
            f = left[:]
        fronts.append(f)
        left = [g for g in left if g not in f]
    order = []
    for f in fronts:
        crowd = {g: 0.0 for g in f}
        if all(rs[g]["ok"] for g in f):
            for k, sign in (("val", 1), ("area", -1), ("energy", -1)):
                s = sorted(f, key=lambda g: sign * rs[g][k])
                span = (rs[s[-1]][k] - rs[s[0]][k]) or 1.0
                crowd[s[0]] = crowd[s[-1]] = float("inf")
                for i in range(1, len(s) - 1):
                    crowd[s[i]] += abs(rs[s[i + 1]][k] - rs[s[i - 1]][k]) / abs(span)
        order += sorted(f, key=lambda g: -crowd[g])
    return order


def nsga2(space, budget, rng, pop_size=20, mut=0.25):
    """Counts unique evaluated designs against the budget (cached repeats are free). Returns the evaluated set."""
    space.cache = {}
    pop = []
    while len(pop) < pop_size and len(space.cache) < budget:
        g = tuple(rng.randrange(n) for n in space.dims)
        if g not in pop:
            pop.append(g)
            space.evaluate(g)
    stale = 0
    while len(space.cache) < budget and stale < 200:
        before = len(space.cache)
        kids = []
        for _ in range(pop_size):
            a, b = (min(rng.sample(pop, 2), key=lambda g: pop.index(g)) for _ in range(2))  # pop is best-first
            kid = tuple(a[i] if rng.random() < 0.5 else b[i] for i in range(4))
            kid = tuple(rng.randrange(space.dims[i]) if rng.random() < mut else kid[i] for i in range(4))
            if len(space.cache) < budget or kid in space.cache:
                space.evaluate(kid)
                kids.append(kid)
        pop = _rank_and_crowd(list(dict.fromkeys(pop + kids)), space)[:pop_size]
        stale = stale + 1 if len(space.cache) == before else 0
    return [(g, r) for g, r in space.cache.items()]
