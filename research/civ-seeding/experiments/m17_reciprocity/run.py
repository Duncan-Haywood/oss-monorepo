"""Milestone 17: does keeping only reciprocated ties undo the cost of false ties?

Milestone 16's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule, every extra randomised rule on its own stream keyed by its name, milestone 12's
primary rules, milestone 15's 47-rule reference never swapped), at the measured tie recall
rho = 0.85, with milestone 16's false ties (`seeding.false_reports`, phi x degree per household,
uniform or triadic-closure placement). New: the reciprocity filter (`survey_recall(..., recip=True)`):
a tie between two surveyed households is kept only if both name it; a tie with one surveyed end is
kept on its one report. Three rules (census top degree, census degree discount, the
three-quarters-random half survey) x {phi = 0; phi in {0.25, 0.5} x two placements}, each with and
without the filter: 30 rules. The 15 unfiltered ones carry milestone 16's (and 11's) names, so
their copies must reproduce milestone 16's. Five copies each (`name#r<j>`, j = 1-4).

Contagion always runs on the true network; only the seeding rule sees the noisy one.
Tests H46-H50. Plan in LOG.md (2026-11-19, milestone 17), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m17_reciprocity/run.py   (about 50 minutes on 4 cores)
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
PHI = [0.25, 0.5]
MODES = ["uniform", "closure"]
RBASE = ["census-degree", "census-dd", "adaptive-dd-0.5-s0.75"]
# milestone 15's key rules: excluded from the reference so it is the same 47-rule set
M15_KEY = {m11.name(b, r) for b in RBASE for r in (0.7, 0.75, 0.8, 0.85, 0.9)}


def _deg(v, b, r, f, design, split, fp, mode, recip):
    return sd.rule_recall_degree(v, b, r, f, design, split, RHO, fp, mode, recip)


def _dd(v, b, r, f, design, split, fp, mode, recip):
    return sd.rule_recall_dd(v, b, r, f, design, split, RHO, fp=fp, fp_mode=mode, recip=recip)


SPEC = {"census-degree": (_deg, 1.0, "uniform", None), "census-dd": (_dd, 1.0, "uniform", None),
        "adaptive-dd-0.5-s0.75": (_dd, 0.5, "adaptive", 0.75)}


def fname(base, phi, mode=None, recip=False):
    """Unfiltered rules keep milestone 16's names (milestone 11's at phi = 0); filtered add -recip."""
    x = m11.name(base, RHO) if phi == 0 else f"{base}-r{RHO:g}-fp{phi:g}-{mode}"
    return x + "-recip" if recip else x


CELLS = [(0, "uniform")] + [(phi, mode) for phi in PHI for mode in MODES]
NEWFN = {}
for b in RBASE:
    fn, f, design, split = SPEC[b]
    for recip in (False, True):
        for phi, mode in CELLS:
            if phi == 0 and not recip:
                continue  # milestone 11's rule, already in m11.NEW
            NEWFN[fname(b, phi, mode, recip)] = functools.partial(fn, f=f, design=design, split=split, fp=phi,
                                                                    mode=mode, recip=recip)
FN = {**m10.EXTRA, **m11.NEW, **m12.NEW, **NEWFN}
KEY = [fname(b, 0) for b in RBASE] + list(NEWFN)
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
    p("# Milestone 17: the reciprocity filter against false ties at recall 0.85, five Monte Carlo copies of 30 rules")
    p(f"B = {copies[0].shape[0]} joint draws; {N_COPY} copies; reference = {len(ref)} primary rules "
      "(milestone 15's set), never swapped")
    p(f"share of (draw, family, rule) cells where a key rule beats the reference best: copies "
      f"{min(hits):.4f}-{max(hits):.4f}, pooled {hp:.4f}")
    s16 = json.load(open(os.path.join(HERE, "..", "m16_false_ties", "verdicts.json")))["rows"]
    shared = [x for x in KEY if x in s16]
    d16 = max(abs(cm[c, ki[x]] - s16[x]["copies"][c]) for x in shared for c in range(N_COPY))
    p(f"\n## sanity: the {len(shared)} unfiltered rules against milestone 16's copies 0-4, max |difference| {d16:.2e}")

    p("\n## per rule: joint median per copy | pooled median [5%, 95% bootstrap] | MC se | beats perfect-census top degree")
    rows = {}
    for x in KEY:
        i = ki[x]
        lo, hi = np.percentile(pooled[:, i], [5, 95])
        rows[x] = dict(copies=cm[:, i].round(5).tolist(), pooled=round(pm[x], 5), q5=round(float(lo), 5),
                       q95=round(float(hi), 5), se=round(float(se[i]), 5), beats_degree=round(beats(x), 4))
        p(f"  {x:48s} " + " ".join(f"{v * 100:.2f}" for v in cm[:, i])
          + f" | {pm[x] * 100:.2f} [{lo * 100:.2f}, {hi * 100:.2f}] | {se[i] * 100:.2f} | {beats(x):.3f}")
    p(f"\n## reference rows (same reference): perfect census dd-0.05 {dd_ref * 100:.2f}, census top degree {deg_ref * 100:.2f}")

    def show(title, pairs, store):
        p(f"\n## {title} (pooled, MC se from paired copies, z)")
        for key, a, b in pairs:
            d, _, s_ = diff(a, b)
            store[key] = dict(d=round(d, 5), se=round(s_, 5))
            p(f"  {key:44s}: {d * 100:+.2f} (se {s_ * 100:.2f}, z {d / s_ if s_ else 0:+.1f})")

    gain, cost_u, cost_f = {}, {}, {}
    show("filter: filtered minus unfiltered at the same cell (negative = the filter helps)",
         [(f"{b}|{ph:g}|{m}", fname(b, ph, m, True), fname(b, ph, m)) for b in RBASE for ph, m in CELLS], gain)
    show("unfiltered: cost of false ties, phi minus phi = 0",
         [(f"{b}|{ph:g}|{m}", fname(b, ph, m), fname(b, 0)) for b in RBASE for ph, m in CELLS[1:]], cost_u)
    show("filtered: cost of false ties, phi minus phi = 0",
         [(f"{b}|{ph:g}|{m}", fname(b, ph, m, True), fname(b, 0, recip=True)) for b in RBASE for ph, m in CELLS[1:]],
         cost_f)

    sv = "adaptive-dd-0.5-s0.75"
    g46 = gain["census-dd|0.5|closure"]
    h46 = bool(-g46["d"] > 2 * g46["se"])
    g47 = gain["census-dd|0|uniform"]
    h47 = bool(g47["d"] <= 0.005)
    c48 = {m: cost_f[f"census-dd|0.5|{m}"] for m in MODES}
    h48 = bool(all(c["d"] <= 2 * c["se"] for c in c48.values()))
    g49 = gain[f"{sv}|0.5|closure"]
    h49 = bool(-g49["d"] > 2 * g49["se"])
    g50 = gain["census-degree|0.25|closure"]
    h50 = bool(-g50["d"] > 2 * g50["se"])
    p(f"\nH46 (the filter undoes closure errors: census dd at phi = 0.5 closure, filtered better than unfiltered by > 2 MC se): "
      f"{'held' if h46 else 'refuted'}; {g46['d'] * 100:+.2f} (se {g46['se'] * 100:.2f})")
    p(f"H47 (the filter is cheap with no false ties: census dd at phi = 0, filtered no more than 0.5 point worse): "
      f"{'held' if h47 else 'refuted'}; {g47['d'] * 100:+.2f} (se {g47['se'] * 100:.2f})")
    p(f"H48 (filtered census dd is flat in phi: phi = 0.5 minus phi = 0 within 2 MC se, both placements): "
      f"{'held' if h48 else 'refuted'}; " + ", ".join(f"{m}: {c['d'] * 100:+.2f} (se {c['se'] * 100:.2f})" for m, c in c48.items()))
    p(f"H49 (the filter helps the half survey: phi = 0.5 closure, filtered better by > 2 MC se): "
      f"{'held' if h49 else 'refuted'}; {g49['d'] * 100:+.2f} (se {g49['se'] * 100:.2f})")
    p(f"H50 (the filter helps census top degree: phi = 0.25 closure, filtered better by > 2 MC se): "
      f"{'held' if h50 else 'refuted'}; {g50['d'] * 100:+.2f} (se {g50['se'] * 100:.2f})")
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"key": KEY, "phi": PHI, "modes": MODES, "rho": RHO, "rows": rows, "gain": gain, "cost_unfiltered": cost_u,
               "cost_filtered": cost_f, "sanity_m16": d16, "hits": [hits, hp],
               "h46": [g46, h46], "h47": [g47, h47], "h48": [c48, h48], "h49": [g49, h49], "h50": [g50, h50],
               "ref": {"dd-0.05": dd_ref, "degree": deg_ref}},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
