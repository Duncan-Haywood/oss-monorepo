"""Milestone 18: does the reciprocity filter still pay when both ends invent the same false tie?

Milestone 17's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule, every extra randomised rule on its own stream keyed by its name, milestone 12's
primary rules, milestone 15's 47-rule reference never swapped), at tie recall rho = 0.85 and
milestone 16's false ties at phi = 0.5 per true tie. New: correlated false reports
(`survey_recall(..., fp_joint=kappa)`): each false report i -> j is echoed j -> i with probability
kappa, so the reciprocity filter cannot remove it. The echo adds no new pair, so an unfiltered census
is identical at every kappa (tested) and is run once. Rules: census top degree and census degree
discount under closure (unfiltered; filtered at kappa = 0, 0.25, 0.5, 1) and uniform placement
(unfiltered; filtered at kappa = 0, 0.5, 1); the three-quarters-random half survey under closure,
unfiltered and filtered at kappa = 0 and 1. 22 rules; the 10 at kappa = 0 carry milestone 17's
names, so their copies must reproduce milestone 17's. Five copies each (`name#r<j>`, j = 1-4).

Contagion always runs on the true network; only the seeding rule sees the noisy one.
Tests H51-H55. Plan in LOG.md (2026-11-19, milestone 18), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m18_joint/run.py   (about 40 minutes on 4 cores)
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
PHI = 0.5
RBASE = ["census-degree", "census-dd", "adaptive-dd-0.5-s0.75"]
CENSUS = RBASE[:2]
SV = RBASE[2]
M15_KEY = {m11.name(b, r) for b in RBASE for r in (0.7, 0.75, 0.8, 0.85, 0.9)}


def _deg(v, b, r, f, design, split, fp, mode, recip, joint):
    return sd.rule_recall_degree(v, b, r, f, design, split, RHO, fp, mode, recip, joint)


def _dd(v, b, r, f, design, split, fp, mode, recip, joint):
    return sd.rule_recall_dd(v, b, r, f, design, split, RHO, fp=fp, fp_mode=mode, recip=recip, fp_joint=joint)


SPEC = {"census-degree": (_deg, 1.0, "uniform", None), "census-dd": (_dd, 1.0, "uniform", None),
        SV: (_dd, 0.5, "adaptive", 0.75)}


def fname(base, mode, recip=False, kappa=0.0):
    """kappa = 0 keeps milestone 17's names; kappa > 0 adds -j<kappa>."""
    x = f"{base}-r{RHO:g}-fp{PHI:g}-{mode}" + ("-recip" if recip else "")
    return x + (f"-j{kappa:g}" if kappa else "")


KAPPA = {"closure": [0.0, 0.25, 0.5, 1.0], "uniform": [0.0, 0.5, 1.0]}
CELLS = []   # (base, mode, recip, kappa)
for b in CENSUS:
    for mode, ks in KAPPA.items():
        CELLS.append((b, mode, False, 0.0))
        CELLS += [(b, mode, True, k) for k in ks]
CELLS += [(SV, "closure", recip, k) for k in (0.0, 1.0) for recip in (False, True)]

NEWFN = {}
for b, mode, recip, kappa in CELLS:
    fn, f, design, split = SPEC[b]
    NEWFN[fname(b, mode, recip, kappa)] = functools.partial(fn, f=f, design=design, split=split, fp=PHI, mode=mode,
                                                            recip=recip, joint=kappa)
FN = {**m10.EXTRA, **m11.NEW, **m12.NEW, **NEWFN}
KEY = list(NEWFN)
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


def crossing(xs, ys):
    """First x where the piecewise-linear ys crosses from below 0 to >= 0; None if it never does."""
    for (x0, y0), (x1, y1) in zip(zip(xs, ys), zip(xs[1:], ys[1:])):
        if y0 < 0 <= y1:
            return x0 + (x1 - x0) * (-y0) / (y1 - y0)
    return None if ys[0] < 0 else xs[0]


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
        return pm[a] - pm[b], float(d.std(ddof=1) / np.sqrt(N_COPY))

    degw = worst_regret(r, ref_idx, lambda q: E[q][[k["degree"]]])[0][:, 0]
    ddw = worst_regret(r, ref_idx, lambda q: E[q][[k["dd-0.05"]]])[0][:, 0]
    deg_ref, dd_ref = float(np.median(degw)), float(np.median(ddw))

    def beats(x):
        return float((pooled[:, ki[x]] < degw).mean())

    lines = []
    p = lines.append
    p("# Milestone 18: correlated false reports against the reciprocity filter (recall 0.85, phi = 0.5), "
      f"five Monte Carlo copies of {len(KEY)} rules")
    p(f"B = {copies[0].shape[0]} joint draws; {N_COPY} copies; reference = {len(ref)} primary rules "
      "(milestone 15's set), never swapped")
    p(f"share of (draw, family, rule) cells where a key rule beats the reference best: copies "
      f"{min(hits):.4f}-{max(hits):.4f}, pooled {hp:.4f}")
    s17 = json.load(open(os.path.join(HERE, "..", "m17_reciprocity", "verdicts.json")))["rows"]
    shared = [x for x in KEY if x in s17]
    d17 = max(abs(cm[c, ki[x]] - s17[x]["copies"][c]) for x in shared for c in range(N_COPY))
    p(f"\n## sanity: the {len(shared)} kappa = 0 rules against milestone 17's copies 0-4, max |difference| {d17:.2e}")

    p("\n## per rule: joint median per copy | pooled median [5%, 95% bootstrap] | MC se | beats perfect-census top degree")
    rows = {}
    for x in KEY:
        i = ki[x]
        lo, hi = np.percentile(pooled[:, i], [5, 95])
        rows[x] = dict(copies=cm[:, i].round(5).tolist(), pooled=round(pm[x], 5), q5=round(float(lo), 5),
                       q95=round(float(hi), 5), se=round(float(se[i]), 5), beats_degree=round(beats(x), 4))
        p(f"  {x:52s} " + " ".join(f"{v * 100:.2f}" for v in cm[:, i])
          + f" | {pm[x] * 100:.2f} [{lo * 100:.2f}, {hi * 100:.2f}] | {se[i] * 100:.2f} | {beats(x):.3f}")
    p(f"\n## reference rows (same reference): perfect census dd-0.05 {dd_ref * 100:.2f}, census top degree {deg_ref * 100:.2f}")

    def show(title, pairs, store):
        p(f"\n## {title} (pooled, MC se from paired copies, z)")
        for key, a, b in pairs:
            d, s_ = diff(a, b)
            store[key] = dict(d=round(d, 5), se=round(s_, 5))
            p(f"  {key:40s}: {d * 100:+.2f} (se {s_ * 100:.2f}, z {d / s_ if s_ else 0:+.1f})")

    # unfiltered census rules are kappa-invariant (tested), so they pair with every kappa
    gain, step = {}, {}
    pairs = [(f"{b}|{m}|{kp:g}", fname(b, m, True, kp), fname(b, m)) for b in CENSUS for m, ks in KAPPA.items()
             for kp in ks]
    pairs += [(f"{SV}|closure|{kp:g}", fname(SV, "closure", True, kp), fname(SV, "closure", False, kp))
              for kp in (0.0, 1.0)]
    show("filter: filtered minus unfiltered (negative = the filter helps)", pairs, gain)
    spairs = [(f"{b}|{m}|{k0:g}->{k1:g}", fname(b, m, True, k1), fname(b, m, True, k0))
              for b in CENSUS for m, ks in KAPPA.items() for k0, k1 in zip(ks, ks[1:])]
    spairs.append((f"{SV}|closure|unfiltered|0->1", fname(SV, "closure", False, 1.0), fname(SV, "closure")))
    spairs.append((f"{SV}|closure|filtered|0->1", fname(SV, "closure", True, 1.0), fname(SV, "closure", True)))
    show("correlation: filtered (or survey) regret, higher kappa minus lower", spairs, step)

    be = {}
    p("\n## break-even kappa (filter gain crosses zero, linear interpolation of pooled gains; exploratory)")
    for b in CENSUS:
        for m, ks in KAPPA.items():
            ys = [gain[f"{b}|{m}|{kp:g}"]["d"] for kp in ks]
            x = crossing(ks, ys)
            be[f"{b}|{m}"] = x
            p(f"  {b}|{m}: " + ("never (the filter helps at every kappa)" if x is None else f"{x:.2f}")
              + "   gains " + ", ".join(f"{y * 100:+.2f}" for y in ys))

    g51 = gain["census-dd|closure|0.5"]
    h51 = bool(-g51["d"] > 2 * g51["se"])
    g52 = {m: gain[f"census-degree|{m}|1"] for m in KAPPA}
    h52 = bool(all(g["d"] > 2 * g["se"] for g in g52.values()))
    s53 = {kk: v for kk, v in step.items() if kk.split("|")[0] in CENSUS and "|closure|" in kk}
    bad53 = {kk: v for kk, v in s53.items() if -v["d"] > 2 * v["se"]}
    h53 = not bad53
    g54 = gain[f"{SV}|closure|1"]
    h54 = bool(not (-g54["d"] > 2 * g54["se"]))
    b55 = beats(fname("census-dd", "closure", True, 1.0))
    h55 = bool(b55 >= 0.9)
    p(f"\nH51 (the filter survives half-correlated errors: census dd, closure, kappa = 0.5, filtered better by > 2 MC se): "
      f"{'held' if h51 else 'refuted'}; {g51['d'] * 100:+.2f} (se {g51['se'] * 100:.2f})")
    p("H52 (fully correlated errors make the filter a pure cost: census top degree, kappa = 1, filtered worse by > 2 MC se, both placements): "
      f"{'held' if h52 else 'refuted'}; " + ", ".join(f"{m}: {g['d'] * 100:+.2f} (se {g['se'] * 100:.2f})" for m, g in g52.items()))
    p(f"H53 (more correlation never helps the filter: no adjacent closure step falls by > 2 MC se, 6 tests): "
      f"{'held' if h53 else 'refuted'}" + ("" if h53 else "; " + ", ".join(
          f"{kk} {v['d'] * 100:+.2f} (z {v['d'] / v['se']:+.1f})" for kk, v in bad53.items())))
    p(f"H54 (correlation does not rescue the filter for the half survey: closure, kappa = 1, filtered not better by > 2 MC se): "
      f"{'held' if h54 else 'refuted'}; {g54['d'] * 100:+.2f} (se {g54['se'] * 100:.2f})")
    p(f"H55 (filtered census dd at closure, kappa = 1 beats perfect-census top degree in >= 90% of draws): "
      f"{'held' if h55 else 'refuted'}; {b55 * 100:.1f}%")
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"key": KEY, "kappa": KAPPA, "phi": PHI, "rho": RHO, "rows": rows, "gain": gain, "step": step,
               "break_even": be, "sanity_m17": d17, "hits": [hits, hp],
               "h51": [g51, h51], "h52": [g52, h52], "h53": [s53, h53], "h54": [g54, h54], "h55": [b55, h55],
               "ref": {"dd-0.05": dd_ref, "degree": deg_ref}},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
