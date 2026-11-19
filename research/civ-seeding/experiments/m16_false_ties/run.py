"""Milestone 16: does the seeding advice survive respondents who name ties that do not exist?

Milestone 15's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule, every extra randomised rule on its own stream keyed by its name, milestone 12's
primary rules, the same 47-rule reference), at the measured tie recall rho = 0.85, plus spurious
ties (`seeding.false_reports`): each household names Poisson(phi x its degree) households it has
no tie to, placed either uniformly among non-neighbours or among friends of friends
(triadic closure). Three rules (census top degree, census degree discount, the
three-quarters-random half survey) x phi in {0.1, 0.25, 0.5} x two placements = 18 new rules,
plus the three rules at phi = 0 (milestone 11's names, so their copies reproduce milestone 15's
copies 0-4); five copies each (`name#r<j>`, j = 1-4).

Contagion always runs on the true network; only the seeding rule sees the noisy one.
Tests H42-H45. Plan in LOG.md (2026-11-18, milestone 16), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m16_false_ties/run.py   (about 35 minutes on 4 cores)
"""
import functools
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import seeding as sd  # noqa: E402

_spec = importlib.util.spec_from_file_location("m12", os.path.join(HERE, "..", "m12_strength", "run.py"))
m12 = importlib.util.module_from_spec(_spec)
sys.modules["m12"] = m12
_spec.loader.exec_module(m12)
m6, m11, m10 = m12.m6, m12.m11, m12.m10

N_COPY = 5
RHO = 0.85
PHI = [0.1, 0.25, 0.5]
MODES = ["uniform", "closure"]
RBASE = ["census-degree", "census-dd", "adaptive-dd-0.5-s0.75"]
# milestone 15's key rules: excluded from the reference so it is the same 47-rule set
M15_KEY = {m11.name(b, r) for b in RBASE for r in (0.7, 0.75, 0.8, 0.85, 0.9)}


def _deg(v, b, r, f, design, split, fp, mode):
    return sd.rule_recall_degree(v, b, r, f, design, split, RHO, fp, mode)


def _dd(v, b, r, f, design, split, fp, mode):
    return sd.rule_recall_dd(v, b, r, f, design, split, RHO, fp=fp, fp_mode=mode)


SPEC = {"census-degree": (_deg, 1.0, "uniform", None), "census-dd": (_dd, 1.0, "uniform", None),
        "adaptive-dd-0.5-s0.75": (_dd, 0.5, "adaptive", 0.75)}


def fname(base, phi, mode=None):
    return m11.name(base, RHO) if phi == 0 else f"{base}-r{RHO:g}-fp{phi:g}-{mode}"


NEWFN = {}
for b in RBASE:
    fn, f, design, split = SPEC[b]
    for phi in PHI:
        for mode in MODES:
            NEWFN[fname(b, phi, mode)] = functools.partial(fn, f=f, design=design, split=split, fp=phi, mode=mode)
FN = {**m10.EXTRA, **m11.NEW, **m12.NEW, **NEWFN}
KEY = [fname(b, 0)for b in RBASE] + list(NEWFN)
REPS = {f"{c}#r{j}": FN[c] for c in KEY for j in range(1, N_COPY)}
m6.EXTRA_RANDOMISED = {**m6.EXTRA_RANDOMISED, **NEWFN, **REPS}
m6.PER_RULE_STREAMS = True
m6.NOT_IN_REFERENCE = set(REPS) | set(NEWFN)
m6.OUT_DIR = HERE


def worst_regret(r, ref_idx, Ecols):
    """B x len(cols) worst-case regret against max(reference best, the rule itself) (milestone 15)."""
    W, draws = r["W"], r["draws"]
    B = W.shape[0]
    cache, out, hit = {}, None, []
    for bi in range(B):
        row = []
        for f in m6.FAMS:
            k = draws[bi][f]
            if k not in cache:
                cache[k] = Ecols(k)
            best = r["E"][k][ref_idx] @ W[bi]
            tot = cache[k] @ W[bi]
            m = best.max()
            hit.append(tot > m)
            row.append(1 - tot / np.maximum(m, tot))
        if out is None:
            out = np.zeros((B, len(m6.FAMS), len(row[0])))
        out[bi] = row
    return out.max(1), float(np.mean(hit))


def main():
    r = m6.main()
    E, rules = r["E"], r["rules"]
    k = {c: i for i, c in enumerate(rules)}
    ref = [c for c in rules if c not in REPS and c not in NEWFN and c not in M15_KEY]
    ref_idx = np.array([k[x] for x in ref])

    def cols(c):
        return [k[x if c == 0 else f"{x}#r{c}"] for x in KEY]

    copies, hits = [], []
    for c in range(N_COPY):
        idx = cols(c)
        w, h = worst_regret(r, ref_idx, lambda q, idx=idx: E[q][idx])
        copies.append(w)
        hits.append(h)
    allidx = np.array([cols(c) for c in range(N_COPY)])
    pooled, hp = worst_regret(r, ref_idx, lambda q: E[q][allidx].mean(0))
    ki = {x: i for i, x in enumerate(KEY)}

    def med(w, x):
        return float(np.median(w[:, ki[x]]))
    cm = np.array([[med(w, x) for x in KEY] for w in copies])
    se = cm.std(0, ddof=1) / np.sqrt(N_COPY)
    pm = {x: med(pooled, x) for x in KEY}

    def diff(a, b):
        d = cm[:, ki[a]] - cm[:, ki[b]]
        return pm[a] - pm[b], d, float(d.std(ddof=1) / np.sqrt(N_COPY))

    degw = worst_regret(r, ref_idx, lambda q: E[q][[k["degree"]]])[0][:, 0]
    ddw = worst_regret(r, ref_idx, lambda q: E[q][[k["dd-0.05"]]])[0][:, 0]
    deg_ref, dd_ref = float(np.median(degw)), float(np.median(ddw))

    def beats(x):
        return float((pooled[:, ki[x]] < degw).mean())

    lines = []
    p = lines.append
    p("# Milestone 16: false-positive ties at recall 0.85, five Monte Carlo copies of 21 rules (milestone 15's harness)")
    p(f"B = {copies[0].shape[0]} joint draws; {N_COPY} copies; reference = {len(ref)} primary rules "
      "(milestone 15's set), never swapped")
    p(f"share of (draw, family, rule) cells where a key rule beats the reference best: copies "
      f"{min(hits):.4f}-{max(hits):.4f}, pooled {hp:.4f}")
    s15 = json.load(open(os.path.join(HERE, "..", "m15_grid", "verdicts.json")))["rows"]
    base = [fname(b, 0) for b in RBASE]
    d15 = max(abs(cm[c, ki[x]] - s15[x]["copies"][c]) for x in base for c in range(N_COPY))
    p(f"\n## sanity: the 3 phi = 0 rules against milestone 15's copies 0-4, max |difference| {d15:.2e}")

    p("\n## per rule: joint median per copy | pooled median [5%, 95% bootstrap] | MC se | beats perfect-census top degree")
    rows = {}
    for x in KEY:
        i = ki[x]
        lo, hi = np.percentile(pooled[:, i], [5, 95])
        rows[x] = dict(copies=cm[:, i].round(5).tolist(), pooled=round(pm[x], 5), q5=round(float(lo), 5),
                       q95=round(float(hi), 5), se=round(float(se[i]), 5), beats_degree=round(beats(x), 4))
        p(f"  {x:42s} " + " ".join(f"{v * 100:.2f}" for v in cm[:, i])
          + f" | {pm[x] * 100:.2f} [{lo * 100:.2f}, {hi * 100:.2f}] | {se[i] * 100:.2f} | {beats(x):.3f}")
    p(f"\n## reference rows (same reference): perfect census dd-0.05 {dd_ref * 100:.2f}, census top degree {deg_ref * 100:.2f}")

    p("\n## cost of false ties: pooled score at phi minus phi = 0 (MC se from paired copies, z)")
    cost = {}
    for b in RBASE:
        for mode in MODES:
            for phi in PHI:
                d, _, s_ = diff(fname(b, phi, mode), fname(b, 0))
                cost[f"{b}|{mode}|{phi:g}"] = dict(d=round(d, 5), se=round(s_, 5))
                p(f"  {b:22s} {mode:8s} phi {phi:<4g}: {d * 100:+.2f} (se {s_ * 100:.2f}, z {d / s_ if s_ else 0:+.1f})")

    p("\n## placement: uniform minus closure at the same phi (pooled, MC se)")
    place = {}
    for b in RBASE:
        for phi in PHI:
            d, _, s_ = diff(fname(b, phi, "uniform"), fname(b, phi, "closure"))
            place[f"{b}|{phi:g}"] = dict(d=round(d, 5), se=round(s_, 5))
            p(f"  {b:22s} phi {phi:<4g}: {d * 100:+.2f} (se {s_ * 100:.2f}, z {d / s_ if s_ else 0:+.1f})")

    sv = "adaptive-dd-0.5-s0.75"
    h42c = {f"{m}|{ph:g}": (pm[fname(sv, ph, m)], beats(fname(sv, ph, m))) for m in MODES for ph in (0.1, 0.25)}
    h42 = bool(all(a <= 0.03 and bb >= 0.9 for a, bb in h42c.values()))
    h43c = {m: cost[f"census-dd|{m}|0.25"]["d"] for m in MODES}
    h43 = bool(all(d <= 0.005 for d in h43c.values()))
    pl = place["census-degree|0.25"]
    h44 = bool(pl["d"] > 2 * pl["se"])
    h45c = {m: beats(fname("census-dd", 0.5, m)) for m in MODES}
    h45 = bool(all(x >= 0.9 for x in h45c.values()))
    p(f"\nH42 (half survey at phi <= 0.25, both placements: pooled median <= 3% and beats perfect census top degree in >= 90%): "
      f"{'held' if h42 else 'refuted'}; " + ", ".join(f"{c}: {a * 100:.2f}% / {bb:.3f}" for c, (a, bb) in h42c.items()))
    p(f"H43 (census dd at phi = 0.25 no more than 0.5 point worse than phi = 0, both placements): "
      f"{'held' if h43 else 'refuted'}; " + ", ".join(f"{m}: {d * 100:+.2f}" for m, d in h43c.items()))
    p(f"H44 (census top degree at phi = 0.25: uniform worse than closure by > 2 MC se): {'held' if h44 else 'refuted'}; "
      f"{pl['d'] * 100:+.2f} (se {pl['se'] * 100:.2f})")
    p(f"H45 (stress: census dd at phi = 0.5 beats perfect census top degree in >= 90% of draws, both placements): "
      f"{'held' if h45 else 'refuted'}; " + ", ".join(f"{m}: {x:.3f}" for m, x in h45c.items()))
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"key": KEY, "phi": PHI, "modes": MODES, "rho": RHO, "rows": rows, "cost": cost, "placement": place,
               "sanity_m15": d15, "hits": [hits, hp],
               "h42": [h42c, h42], "h43": [h43c, h43], "h44": [pl, h44], "h45": [h45c, h45],
               "ref": {"dd-0.05": dd_ref, "degree": deg_ref}},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
