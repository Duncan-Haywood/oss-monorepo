"""Milestone 20: does the half-weight reciprocity rule (milestone 19) hold away from the one cell it was
tuned in?

Milestone 19's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule, every extra randomised rule on its own stream keyed by its name, milestone 12's
primary rules, milestone 15's 47-rule reference never swapped), recall rho = 0.85. Milestone 19
tested the soft filter (one-sided checkable ties kept at weight w) only at phi = 0.5 false ties per
true tie, placed to close triangles. This run takes w = 0.5, fixed before the run, to three other
cells: no false ties (phi = 0), phi = 0.25 closure, phi = 0.5 uniform placement; in each, census top
degree and census degree discount, unfiltered, hard-filtered (w = 0) and soft (w = 0.5), the
filtered ones at kappa = 0, 0.5, 1 (milestone 18's share of false ties both ends name; at phi = 0
there are no false ties, so kappa is moot and one filtered rule of each kind is run). 34 rules; the
16 that milestones 11, 17 and 18 already ran carry their names, so their copies must reproduce
those milestones'. Five copies each (`name#r<j>`, j = 1-4).

Contagion always runs on the true network; only the seeding rule sees the noisy one.
Tests H60-H64. Plan in LOG.md (2026-11-20, milestone 20), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m20_soft_cells/run.py   (about 80 minutes on 4 cores)
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
W = 0.5
CENSUS = ["census-degree", "census-dd"]
M15_KEY = {m11.name(b, r) for b in CENSUS + ["adaptive-dd-0.5-s0.75"] for r in (0.7, 0.75, 0.8, 0.85, 0.9)}
CELLS3 = [(0.0, "uniform"), (0.25, "closure"), (0.5, "uniform")]   # (phi, placement)
KAPPAS = [0.0, 0.5, 1.0]


def _deg(v, b, r, phi, mode, recip, joint, w):
    return sd.rule_recall_degree(v, b, r, 1.0, "uniform", None, RHO, phi, mode, recip, joint, w)


def _dd(v, b, r, phi, mode, recip, joint, w):
    return sd.rule_recall_dd(v, b, r, 1.0, "uniform", None, RHO, fp=phi, fp_mode=mode, recip=recip,
                             fp_joint=joint, recip_w=w)


SPEC = {"census-degree": _deg, "census-dd": _dd}


def fname(base, phi, mode, recip=False, kappa=0.0, w=0.0):
    """Milestone 11's names at phi = 0, milestones 16-18's otherwise; soft rules add -w<w>."""
    x = m11.name(base, RHO) if phi == 0 else f"{base}-r{RHO:g}-fp{phi:g}-{mode}"
    x += "-recip" if recip else ""
    x += f"-j{kappa:g}" if kappa else ""
    return x + (f"-w{w:g}" if w else "")


def kappas(phi):
    return [0.0] if phi == 0 else KAPPAS


ROWS = []   # (base, phi, mode, recip, kappa, w)
for b in CENSUS:
    for phi, mode in CELLS3:
        ROWS.append((b, phi, mode, False, 0.0, 0.0))
        ROWS += [(b, phi, mode, True, k, w) for k in kappas(phi) for w in (0.0, W)]

ALLFN = {fname(*x[:6]): functools.partial(SPEC[x[0]], phi=x[1], mode=x[2], recip=x[3], joint=x[4], w=x[5])
         for x in ROWS}
KEY = list(ALLFN)
NEWFN = {c: f for c, f in ALLFN.items() if c not in m11.NEW}
FN = {**m10.EXTRA, **m11.NEW, **m12.NEW, **NEWFN}
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
    p("# Milestone 20: the half-weight reciprocity rule in three more cells (recall 0.85), five Monte Carlo "
      f"copies of {len(KEY)} rules")
    p(f"B = {copies[0].shape[0]} joint draws; {N_COPY} copies; reference = {len(ref)} primary rules "
      "(milestone 15's set), never swapped")
    p(f"share of (draw, family, rule) cells where a key rule beats the reference best: copies "
      f"{min(hits):.4f}-{max(hits):.4f}, pooled {hp:.4f}")
    prior = {}
    for m in ("m17_reciprocity", "m18_joint"):
        prior.update(json.load(open(os.path.join(HERE, "..", m, "verdicts.json")))["rows"])
    shared = [x for x in KEY if x in prior]
    dprior = max(abs(cm[c, ki[x]] - prior[x]["copies"][c]) for x in shared for c in range(N_COPY))
    p(f"\n## sanity: the {len(shared)} rules milestones 17-18 ran, against their copies 0-4, "
      f"max |difference| {dprior:.2e}")

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
    p("\n## filtered minus unfiltered, and soft minus hard (pooled, MC se from paired copies, z; negative = first is better)")
    for b in CENSUS:
        for phi, mode in CELLS3:
            u = fname(b, phi, mode)
            for k_ in kappas(phi):
                h, s = fname(b, phi, mode, True, k_), fname(b, phi, mode, True, k_, W)
                for tag, a, c in (("hard-unf", h, u), ("soft-unf", s, u), ("soft-hard", s, h)):
                    d, s_ = diff(a, c)
                    gain[f"{b}|{phi:g}|{mode}|{k_:g}|{tag}"] = dict(d=round(d, 5), se=round(s_, 5))
                    p(f"  {b:14s} phi {phi:<4g} {mode:8s} kappa {k_:<4g} {tag:9s}: {d * 100:+.2f} "
                      f"(se {s_ * 100:.2f}, z {d / s_ if s_ else 0:+.1f})")

    worst = {}
    p("\n## worst over kappa of pooled regret (a field team does not know kappa)")
    for b in CENSUS:
        for phi, mode in CELLS3:
            for lab, rc, w in (("unfiltered", False, 0.0), ("hard", True, 0.0), ("soft", True, W)):
                ks = [0.0] if not rc else kappas(phi)
                vals = [pm[fname(b, phi, mode, rc, k_, w)] for k_ in ks]
                j = int(np.argmax(vals))
                worst[f"{b}|{phi:g}|{mode}|{lab}"] = [round(vals[j], 5), ks[j]]
                p(f"  {b:14s} phi {phi:<4g} {mode:8s} {lab:10s}: {vals[j] * 100:.2f} at kappa {ks[j]:g}")

    def g(b, phi, mode, k_, tag):
        return gain[f"{b}|{phi:g}|{mode}|{k_:g}|{tag}"]
    # H60: no false ties, the half weight costs census top degree no more than 2 se
    g60 = g("census-degree", 0.0, "uniform", 0.0, "soft-unf")
    h60 = bool(not (g60["d"] > 2 * g60["se"]))
    # H61: census dd soft never worse than unfiltered by > 2 se in any of the 7 cells
    c61 = {f"{phi:g}|{mode}|{k_:g}": g("census-dd", phi, mode, k_, "soft-unf")
           for phi, mode in CELLS3 for k_ in kappas(phi)}
    h61 = bool(all(not (v["d"] > 2 * v["se"]) for v in c61.values()))
    # H62: census dd soft's worst over kappa below hard's, both false-tie cells (point estimates)
    c62 = {f"{phi:g}|{mode}": (worst[f"census-dd|{phi:g}|{mode}|soft"][0], worst[f"census-dd|{phi:g}|{mode}|hard"][0])
           for phi, mode in CELLS3[1:]}
    h62 = bool(all(s < h for s, h in c62.values()))
    # H63: census dd soft keeps the gain at phi = 0.5 uniform, kappa = 0
    g63 = g("census-dd", 0.5, "uniform", 0.0, "soft-unf")
    h63 = bool(-g63["d"] > 2 * g63["se"])
    # H64: census dd soft's worst over kappa within 2 se of unfiltered in both false-tie cells
    c64 = {}
    for phi, mode in CELLS3[1:]:
        ws, kw = worst[f"census-dd|{phi:g}|{mode}|soft"]
        c64[f"{phi:g}|{mode}"] = g("census-dd", phi, mode, kw, "soft-unf")
    h64 = bool(all(not (v["d"] > 2 * v["se"]) for v in c64.values()))

    def fmt(v):
        return f"{v['d'] * 100:+.2f} (se {v['se'] * 100:.2f})"
    p(f"\nH60 (no false ties: census top degree, w = 0.5, not worse than unfiltered by > 2 MC se): "
      f"{'held' if h60 else 'refuted'}; {fmt(g60)}")
    p(f"H61 (census dd, w = 0.5, not worse than unfiltered by > 2 MC se in any of 7 cells): "
      f"{'held' if h61 else 'refuted'}; " + ", ".join(f"{c} {fmt(v)}" for c, v in c61.items()))
    p(f"H62 (census dd, worst over kappa: w = 0.5 below the hard filter in both false-tie cells, point estimates): "
      f"{'held' if h62 else 'refuted'}; " + ", ".join(f"{c} soft {s * 100:.2f} hard {h * 100:.2f}" for c, (s, h) in c62.items()))
    p(f"H63 (census dd, phi = 0.5 uniform, kappa = 0, w = 0.5 better than unfiltered by > 2 MC se): "
      f"{'held' if h63 else 'refuted'}; {fmt(g63)}")
    p(f"H64 (census dd, w = 0.5 at its worst kappa not worse than unfiltered by > 2 MC se, both false-tie cells): "
      f"{'held' if h64 else 'refuted'}; " + ", ".join(f"{c} {fmt(v)}" for c, v in c64.items()))
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"key": KEY, "kappa": KAPPAS, "w": W, "cells": CELLS3, "rho": RHO, "rows": rows, "gain": gain,
               "worst": worst, "sanity_prior": dprior, "hits": [hits, hp],
               "h60": [g60, h60], "h61": [c61, h61], "h62": [c62, h62], "h63": [g63, h63], "h64": [c64, h64],
               "ref": {"dd-0.05": dd_ref, "degree": deg_ref}},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
