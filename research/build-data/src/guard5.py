"""Session 109 (LOG.md): a guard on the Y-6 chooser's short lean, scored on all 18 city-years.

Session 108's chooser5 takes, per held-out city H and test year Y, the staleness cut in G5 = {1, 2, 3, 4, 5 years}
with the lowest mean (over 3 seeds) q0.9 pinball loss on H's own permits issued in Y-6 and completed by D (k6).
It leaves 1.62 days of pooled regret against the G5 oracle, and its whole cost outside Austin is that it takes the
short cuts in SF 2017 to 2021. The saved fits hold each k6 loss per seed, so the chooser's uncertainty about its own
ranking can be read without any new fit. Three guards, fixed before any per-seed k6 value was looked at:

  spread (primary): v* = chooser5's pick; s = max - min of v*'s three per-seed k6 losses; pick the LONGEST cut v in
                    G5 whose mean k6 <= k6(v*) + s (a one-spread rule, after the one-standard-error rule of
                    cross-validation, leaning to the cut that keeps more source data).
  se:               the same with s = sd(v*'s seeds, ddof 1) / sqrt(3).
  regime:           take nc1 only if k6(nc1) < min over G4 = {nc2, ..., nc5} of k6 minus nc1's own seed spread;
                    otherwise chooser4's pick (lowest k6 over G4).

All scored against the G5 oracle with session 108's test losses. Inputs: the raw per-fit JSONs (per-seed k6) and
session 108's scored cells (`results/rounds_score_floor5_i2c_floor5.json`, means). D0 checks that every per-seed
source reproduces the cell's mean k6 and test loss.

Run: python3 src/guard5.py > results/guard5_i2c.txt   (writes results/guard5_i2c.json)
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "..", "results")
G5 = ("cpin_es3_nc1", "cpin_es3_nc2", "cpin_es3_nc3", "cpin_es3_nc4", "cpin_es3_nc5")
G4 = G5[1:]
LEN = {v: int(v[-1]) for v in G5}  # cut length in years
# every raw file that may hold a fit; for each cell and cut the first whose means match the scored cell is used
SOURCES = ("rounds_score_floor5_i2c.json", "rounds_score_floor_i2c.json", "rounds_score_austin_i2c.json",
           "rounds_score_grid_i2c.json", "rounds_score_early_i2c.json", "rounds_score_oos_i2c.json",
           "rounds_score_rep_i2c.json", "rounds_score_tfol_i2c.json")
TOL = 1e-6


def spread(xs):
    return max(xs) - min(xs)


def se(xs):
    n = len(xs)
    mu = sum(xs) / n
    return math.sqrt(sum((x - mu) ** 2 for x in xs) / (n - 1)) / math.sqrt(n)


def pick_min(k6, grid):
    return min(grid, key=lambda v: (k6[v], LEN[v]))


def pick_guard(k6, seeds, width):
    """Longest cut whose mean k6 is within width(seeds of the min-k6 cut) of the minimum."""
    vs = pick_min(k6, G5)
    s = width(seeds[vs])
    return max((v for v in G5 if k6[v] <= k6[vs] + s), key=lambda v: LEN[v])


def pick_regime(k6, seeds):
    p4 = pick_min(k6, G4)
    return "cpin_es3_nc1" if k6["cpin_es3_nc1"] < k6[p4] - spread(seeds["cpin_es3_nc1"]) else p4


def pick_k(k6, seeds, k):
    """Post hoc margin sweep: the spread rule with s multiplied by k (k = 0 is chooser5)."""
    vs = pick_min(k6, G5)
    s = k * spread(seeds[vs])
    return max((v for v in G5 if k6[v] <= k6[vs] + s + 1e-12), key=lambda v: LEN[v])


def load_sources(res_dir=RES, names=SOURCES):
    out = []
    for n in names:
        p = os.path.join(res_dir, n)
        if os.path.exists(p):
            out.append((n, json.load(open(p))))
    return out


def per_seed(sources, h, Y, v, k6_mean, test_mean):
    """(source name, per-seed k6) of the first source whose k6 and test means match the scored cell, else None."""
    for n, R in sources:
        r = R.get(f"{h} {Y} {v}")
        if not isinstance(r, dict):
            continue
        try:
            xs = [float(x) for x in r["tgt_k"]["6"]["loss_per_seed"]["0.9"]]
            km, tm = float(r["tgt_k"]["6"]["loss"]["0.9"]), float(r["test_loss"]["0.9"])
        except (KeyError, TypeError):
            continue
        if abs(km - k6_mean) < TOL and abs(tm - test_mean) < TOL and abs(sum(xs) / len(xs) - k6_mean) < 1e-4:
            return n, xs
    return None


def summary(cells, sources):
    m = lambda xs: sum(xs) / len(xs) if xs else None  # noqa: E731
    out, miss = [], []
    for c in cells:
        seeds, src = {}, {}
        for v in G5:
            got = per_seed(sources, c["held"], c["year"], v, c["k6"][v], c["test"][v])
            if got is None:
                miss.append(f'{c["held"]} {c["year"]} {v}')
            else:
                src[v], seeds[v] = got
        if len(seeds) < len(G5):
            continue
        k6, test = c["k6"], c["test"]
        oracle = min(G5, key=test.get)
        picks = dict(chooser5=pick_min(k6, G5), chooser4=pick_min(k6, G4), spread=pick_guard(k6, seeds, spread),
                     se=pick_guard(k6, seeds, se), regime=pick_regime(k6, seeds))
        vs = picks["chooser5"]
        out.append(dict(held=c["held"], year=c["year"], oracle=oracle, picks=picks,
                        regret={r: test[p] - test[oracle] for r, p in picks.items()},
                        winner_spread=spread(seeds[vs]), winner_se=se(seeds[vs]),
                        gap_next=(min((k6[v] for v in G5 if v != vs)) - k6[vs]),
                        seeds=seeds, sources=src,
                        sweep={k: test[pick_k(k6, seeds, k)] - test[oracle] for k in (0, 0.5, 1, 2, 3, 5, 10)}))
    rules = ("chooser5", "chooser4", "spread", "se", "regime")
    au = [c for c in out if c["held"] == "austin"]
    ss = [c for c in out if c["held"] != "austin"]
    full = len(out) == 18 and len(au) == 6
    pooled = {r: m([c["regret"][r] for c in out]) for r in rules}
    res = dict(n=len(out), missing=miss, pooled=pooled,
               sfse={r: m([c["regret"][r] for c in ss]) for r in rules},
               austin={r: m([c["regret"][r] for c in au]) for r in rules},
               worst={r: max((c["regret"][r] for c in out), default=None) for r in rules},
               changed_spread=sum(c["picks"]["spread"] != c["picks"]["chooser5"] for c in out),
               picks={r: {v[8:]: sum(c["picks"][r] == v for c in out) for v in G5} for r in rules},
               median_winner_spread=sorted(c["winner_spread"] for c in out)[len(out) // 2] if out else None,
               # post hoc (not pre-registered): pooled regret of the spread rule with the margin times k
               sweep_post_hoc={str(k): m([c["sweep"][k] for c in out]) for k in (0, 0.5, 1, 2, 3, 5, 10)})
    ok = full
    res["predictions"] = dict(
        D0=bool(full and not miss),
        D1=bool(ok and pooled["spread"] < pooled["chooser5"] - 1e-9),
        D2=bool(ok and res["sfse"]["spread"] < res["sfse"]["chooser5"] - 1e-9),
        D3=bool(ok and res["austin"]["spread"] <= 1.0),
        D4=bool(ok and res["worst"]["spread"] <= res["worst"]["chooser5"] + 1e-9),
        D5=bool(ok and res["changed_spread"] >= 4),
        D6=bool(ok and pooled["regime"] < pooled["chooser5"] - 1e-9),
        D7=bool(ok and pooled["se"] < pooled["chooser5"] - 1e-9))
    res["cells"] = out
    return res


def main():
    cells = json.load(open(os.path.join(RES, "rounds_score_floor5_i2c_floor5.json")))["cells"]
    s = summary(cells, load_sources())
    json.dump(s, open(os.path.join(RES, "guard5_i2c.json"), "w"), indent=1)
    print("Session 109: guards on the Y-6 chooser's short lean; q0.9 regret (days) against the G5 oracle, 18 cells")
    for k in ("n", "missing", "pooled", "sfse", "austin", "worst", "changed_spread", "picks", "median_winner_spread",
              "sweep_post_hoc", "predictions"):
        v = s[k]
        if isinstance(v, dict):
            v = {a: (round(b, 3) if isinstance(b, float) else b) for a, b in v.items()}
        elif isinstance(v, float):
            v = round(v, 3)
        print(f"{k}: {v}")
    for c in s["cells"]:
        print(c["held"], c["year"], "oracle", c["oracle"][8:], {r: p[8:] for r, p in c["picks"].items()},
              "regret", {r: round(x, 2) for r, x in c["regret"].items()}, "winner spread", round(c["winner_spread"], 2),
              "se", round(c["winner_se"], 2), "gap to next", round(c["gap_next"], 2))


if __name__ == "__main__":
    sys.exit(main())
