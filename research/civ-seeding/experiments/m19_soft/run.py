"""Milestone 19: does a soft reciprocity filter keep the filter's gain without its cost under
correlated false ties?

Milestone 18's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule, every extra randomised rule on its own stream keyed by its name, milestone 12's
primary rules, milestone 15's 47-rule reference never swapped), at tie recall rho = 0.85 and
milestone 16's triangle-closing false ties at phi = 0.5 per true tie, with milestone 18's share kappa
of false ties echoed by the other end. New: the soft filter (`survey_recall(..., recip_w=w)`): a
checkable tie only one end names is kept at weight w in the seen network (and in surveyed
households' degree) instead of dropped. Rules: census top degree and census degree discount,
unfiltered, hard-filtered (w = 0) and soft-filtered at w = 0.25, 0.5, 0.75, each at kappa = 0, 0.5, 1
(the unfiltered census is kappa-invariant, milestone 18, and is run once). 26 rules; the 8
unfiltered and hard-filtered ones carry milestone 18's names, so their copies must reproduce
milestone 18's. Five copies each (`name#r<j>`, j = 1-4).

Contagion always runs on the true network; only the seeding rule sees the noisy one.
Tests H56-H59. Plan in LOG.md (2026-11-19, milestone 19), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m19_soft/run.py   (about 50 minutes on 4 cores)
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
MODE = "closure"
CENSUS = ["census-degree", "census-dd"]
M15_KEY = {m11.name(b, r) for b in CENSUS + ["adaptive-dd-0.5-s0.75"] for r in (0.7, 0.75, 0.8, 0.85, 0.9)}
KAPPAS = [0.0, 0.5, 1.0]
WS = [0.0, 0.25, 0.5, 0.75]          # 0 = milestone 17's hard filter


def _deg(v, b, r, recip, joint, w):
    return sd.rule_recall_degree(v, b, r, 1.0, "uniform", None, RHO, PHI, MODE, recip, joint, w)


def _dd(v, b, r, recip, joint, w):
    return sd.rule_recall_dd(v, b, r, 1.0, "uniform", None, RHO, fp=PHI, fp_mode=MODE, recip=recip,
                             fp_joint=joint, recip_w=w)


SPEC = {"census-degree": _deg, "census-dd": _dd}


def fname(base, recip=False, kappa=0.0, w=0.0):
    """Milestone 18's names for unfiltered and hard-filtered rules; soft ones add -w<w>."""
    x = f"{base}-r{RHO:g}-fp{PHI:g}-{MODE}" + ("-recip" if recip else "")
    x += f"-j{kappa:g}" if kappa else ""
    return x + (f"-w{w:g}" if w else "")


CELLS = []   # (base, recip, kappa, w)
for b in CENSUS:
    CELLS.append((b, False, 0.0, 0.0))
    CELLS += [(b, True, k, w) for k in KAPPAS for w in WS]

NEWFN = {fname(b, rc, k, w): functools.partial(SPEC[b], recip=rc, joint=k, w=w) for b, rc, k, w in CELLS}
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
    p("# Milestone 19: the soft reciprocity filter against correlated false ties (recall 0.85, phi = 0.5, "
      f"closure), five Monte Carlo copies of {len(KEY)} rules")
    p(f"B = {copies[0].shape[0]} joint draws; {N_COPY} copies; reference = {len(ref)} primary rules "
      "(milestone 15's set), never swapped")
    p(f"share of (draw, family, rule) cells where a key rule beats the reference best: copies "
      f"{min(hits):.4f}-{max(hits):.4f}, pooled {hp:.4f}")
    s18 = json.load(open(os.path.join(HERE, "..", "m18_joint", "verdicts.json")))["rows"]
    shared = [x for x in KEY if x in s18]
    d18 = max(abs(cm[c, ki[x]] - s18[x]["copies"][c]) for x in shared for c in range(N_COPY))
    p(f"\n## sanity: the {len(shared)} unfiltered and hard-filtered rules against milestone 18's copies 0-4, "
      f"max |difference| {d18:.2e}")

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

    gain = {}
    p("\n## filter at weight w: filtered minus unfiltered (pooled, MC se from paired copies, z; negative = it helps)")
    for b in CENSUS:
        for k_ in KAPPAS:
            for w in WS:
                d, s_ = diff(fname(b, True, k_, w), fname(b))
                gain[f"{b}|{k_:g}|{w:g}"] = dict(d=round(d, 5), se=round(s_, 5))
                p(f"  {b:14s} kappa {k_:<4g} w {w:<4g}: {d * 100:+.2f} (se {s_ * 100:.2f}, z {d / s_ if s_ else 0:+.1f})")

    lin = {}
    p("\n## against linear interpolation hard + w (unfiltered - hard), pooled (negative = soft beats the line)")
    for b in CENSUS:
        for k_ in KAPPAS:
            h, u = pm[fname(b, True, k_)], pm[fname(b)]
            for w in WS[1:]:
                x = pm[fname(b, True, k_, w)] - (h + w * (u - h))
                lin[f"{b}|{k_:g}|{w:g}"] = round(x, 5)
                p(f"  {b:14s} kappa {k_:<4g} w {w:<4g}: {x * 100:+.2f}")

    worst = {}
    p("\n## worst over kappa in (0, 0.5, 1) of pooled regret (a field team does not know kappa)")
    for b in CENSUS:
        worst[f"{b}|unfiltered"] = (pm[fname(b)], None)
        p(f"  {b:14s} unfiltered: {pm[fname(b)] * 100:.2f} (kappa-invariant)")
        for w in WS:
            vals = [pm[fname(b, True, k_, w)] for k_ in KAPPAS]
            j = int(np.argmax(vals))
            worst[f"{b}|{w:g}"] = (vals[j], KAPPAS[j])
            d, s_ = diff(fname(b, True, KAPPAS[j], w), fname(b))
            p(f"  {b:14s} w {w:<4g}: {vals[j] * 100:.2f} at kappa {KAPPAS[j]:g}; minus unfiltered there "
              f"{d * 100:+.2f} (se {s_ * 100:.2f})")

    g56 = gain["census-dd|0|0.5"]
    h56 = bool(-g56["d"] > 2 * g56["se"])
    g57 = gain["census-dd|1|0.5"]
    h57 = bool(not (g57["d"] > 2 * g57["se"]))
    wdd = {w: worst[f"census-dd|{w:g}"][0] for w in WS}
    best_w = min(WS[1:], key=lambda w: wdd[w])
    h58 = bool(wdd[best_w] < min(worst["census-dd|unfiltered"][0], wdd[0.0]))
    g59 = gain["census-degree|0|0.5"]
    h59 = bool(-g59["d"] > 2 * g59["se"])
    p(f"\nH56 (the soft filter keeps the gain: census dd, kappa = 0, w = 0.5, better than unfiltered by > 2 MC se): "
      f"{'held' if h56 else 'refuted'}; {g56['d'] * 100:+.2f} (se {g56['se'] * 100:.2f})")
    p(f"H57 (the soft filter caps the cost: census dd, kappa = 1, w = 0.5, not worse than unfiltered by > 2 MC se): "
      f"{'held' if h57 else 'refuted'}; {g57['d'] * 100:+.2f} (se {g57['se'] * 100:.2f})")
    p(f"H58 (some soft weight beats both ends in the worst case over kappa, census dd, pooled point estimates): "
      f"{'held' if h58 else 'refuted'}; best w {best_w:g} at {wdd[best_w] * 100:.2f} against unfiltered "
      f"{worst['census-dd|unfiltered'][0] * 100:.2f} and hard {wdd[0.0] * 100:.2f}")
    p(f"H59 (census top degree, kappa = 0, w = 0.5, better than unfiltered by > 2 MC se): "
      f"{'held' if h59 else 'refuted'}; {g59['d'] * 100:+.2f} (se {g59['se'] * 100:.2f})")
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"key": KEY, "kappa": KAPPAS, "w": WS, "phi": PHI, "rho": RHO, "rows": rows, "gain": gain,
               "vs_linear": lin, "worst": worst, "sanity_m18": d18, "hits": [hits, hp],
               "h56": [g56, h56], "h57": [g57, h57], "h58": [{str(w): v for w, v in wdd.items()}, best_w, h58],
               "h59": [g59, h59], "ref": {"dd-0.05": dd_ref, "degree": deg_ref}},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
