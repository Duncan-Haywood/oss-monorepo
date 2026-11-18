"""Milestone 15: is the seeding advice monotone in tie recall between 0.7 and 0.9, with ten Monte Carlo copies?

Milestone 14's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule, every extra randomised rule on its own stream keyed by its name, milestone 12's
53 primary rules), plus three rules (census top degree, census degree discount, the
three-quarters-random half survey) at tie recall rho = 0.7, 0.8 and 0.9, and nine replicates
(`name#r<j>`, surveys and scoring runs drawn afresh) of those three rules at rho = 0.7, 0.75,
0.8, 0.85 and 0.9: 15 rules, ten copies each.

Reference set: milestone 12's 53 primary rules minus the 15 key rules, never swapped, so every
copy and every recall level is scored against the same best rule. A key rule's worst-case regret
is 1 - its adopters / max(reference best, its adopters) under each family's refitted process,
maximised over families. Two readings per rule: per copy (c = 0 primary, 1-9 replicates) and
pooled (each village's mean adopters over the ten copies, 1,000 draws per village). Monte Carlo
se of a pooled median = sd of the ten copy medians / sqrt(10); of a pooled difference = sd of
the ten per-copy differences / sqrt(10).

Tests H38-H41. Plan in LOG.md (2026-11-18, milestone 15), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m15_grid/run.py   (about 50 minutes on 4 cores)
"""
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))

_spec = importlib.util.spec_from_file_location("m12", os.path.join(HERE, "..", "m12_strength", "run.py"))
m12 = importlib.util.module_from_spec(_spec)
sys.modules["m12"] = m12
_spec.loader.exec_module(m12)
m6, m11, m10 = m12.m6, m12.m11, m12.m10

N_COPY = 10
GRID = [0.7, 0.75, 0.8, 0.85, 0.9]
NEW_RHO = [0.7, 0.8, 0.9]
RBASE = ["census-degree", "census-dd", "adaptive-dd-0.5-s0.75"]
NEWFN = {}
for rho in NEW_RHO:
    NEWFN.update({k: v for k, v in m11.rules_at(rho).items() if any(k == m11.name(b, rho) for b in RBASE)})
FN = {**m10.EXTRA, **m11.NEW, **m12.NEW, **NEWFN}
KEY = [m11.name(b, r) for b in RBASE for r in GRID]
REPS = {f"{c}#r{j}": FN[c] for c in KEY for j in range(1, N_COPY)}
m6.EXTRA_RANDOMISED = {**m6.EXTRA_RANDOMISED, **NEWFN, **REPS}
m6.PER_RULE_STREAMS = True
m6.NOT_IN_REFERENCE = set(REPS) | set(NEWFN)
m6.OUT_DIR = HERE


def worst_regret(r, ref_idx, Ecols):
    """B x len(cols) worst-case regret against max(reference best, the rule itself)."""
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
    ref = [c for c in rules if c not in REPS and c not in NEWFN and c not in KEY]
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
    cm = np.array([[med(w, x) for x in KEY] for w in copies])         # copies x KEY
    se = cm.std(0, ddof=1) / np.sqrt(N_COPY)
    pm = {x: med(pooled, x) for x in KEY}

    def diff(a, b, n=N_COPY):
        d = cm[:n, ki[a]] - cm[:n, ki[b]]
        return pm[a] - pm[b], d, float(d.std(ddof=1) / np.sqrt(n))

    lines = []
    p = lines.append
    p("# Milestone 15: recall grid 0.7-0.9, ten Monte Carlo copies of 15 rules (milestone 14's harness)")
    p(f"B = {copies[0].shape[0]} joint draws; {N_COPY} copies; reference = {len(ref)} primary rules "
      "(milestone 12's set minus the 15 key rules), never swapped")
    p(f"share of (draw, family, rule) cells where a key rule beats the reference best: copies "
      f"{min(hits):.4f}-{max(hits):.4f}, pooled {hp:.4f}")

    # sanity against milestone 14: copy 0 (and copies 1-4) of the six shared rules
    s14 = json.load(open(os.path.join(HERE, "..", "m14_pooled", "verdicts.json")))["rows"]
    shared = [x for x in KEY if x in s14]
    d0 = max(abs(cm[0, ki[x]] - s14[x]["copies"][0]) for x in shared)
    d14 = max(abs(cm[c, ki[x]] - s14[x]["copies"][c]) for x in shared for c in range(5))
    p(f"\n## sanity: the {len(shared)} rules shared with milestone 14, copy 0 max |difference| {d0:.2e}, "
      f"copies 0-4 {d14:.2e} (milestone 14 scored them with its own 16 swapped into the reference)")

    p("\n## per rule: joint median per copy | pooled median [5%, 95% bootstrap] | MC se | "
      "copy sd")
    rows = {}
    for x in KEY:
        i = ki[x]
        lo, hi = np.percentile(pooled[:, i], [5, 95])
        rows[x] = dict(copies=cm[:, i].round(5).tolist(), pooled=round(pm[x], 5), q5=round(float(lo), 5),
                       q95=round(float(hi), 5), se=round(float(se[i]), 5),
                       sd=round(float(cm[:, i].std(ddof=1)), 5),
                       copy_mean_minus_pooled=round(float(cm[:, i].mean() - pm[x]), 5))
        p(f"  {x:30s} " + " ".join(f"{v * 100:.2f}" for v in cm[:, i])
          + f" | {pm[x] * 100:.2f} [{lo * 100:.2f}, {hi * 100:.2f}] | {se[i] * 100:.2f} | {cm[:, i].std(ddof=1) * 100:.2f}")
    deg_ref = float(np.median(worst_regret(r, ref_idx, lambda q: E[q][[k["degree"]]])[0][:, 0]))
    dd_ref = float(np.median(worst_regret(r, ref_idx, lambda q: E[q][[k["dd-0.05"]]])[0][:, 0]))
    p(f"\n## reference rows (same reference): perfect census dd-0.05 {dd_ref * 100:.2f}, census top degree {deg_ref * 100:.2f}")

    # H38: monotone across adjacent grid points; H39: census dd 0.85 vs 0.75
    p("\n## adjacent recall levels: score at the higher rho minus the lower (pooled, MC se, z); positive = more recall scores worse")
    h38, adj = True, {}
    for b in RBASE:
        adj[b] = []
        for lo_, hi_ in zip(GRID[:-1], GRID[1:]):
            d, dc, s_ = diff(m11.name(b, hi_), m11.name(b, lo_))
            z = d / s_ if s_ > 0 else float("inf")
            adj[b].append(dict(lo=lo_, hi=hi_, d=round(d, 5), se=round(s_, 5), z=round(z, 2)))
            if d > 2 * s_:
                h38 = False
            p(f"  {b:22s} {hi_:.2f} - {lo_:.2f}: {d * 100:+.2f} (se {s_ * 100:.2f}, z {z:+.1f})")
    d39, d39c, s39 = diff(m11.name("census-dd", 0.85), m11.name("census-dd", 0.75))
    d39_5, _, s39_5 = diff(m11.name("census-dd", 0.85), m11.name("census-dd", 0.75), n=5)
    h39 = bool(d39 <= 2 * s39)
    p(f"\n## census dd, 0.85 - 0.75: {d39 * 100:+.2f}; copies " + " ".join(f"{v * 100:+.2f}" for v in d39c)
      + f"; se {s39 * 100:.2f} (from copies 0-4 only: se {s39_5 * 100:.2f})")
    # slope: least squares of pooled median on rho over the grid, per rule, with MC se from copies
    slopes = {}
    g = np.array(GRID)
    for b in RBASE:
        ys = np.array([[cm[c, ki[m11.name(b, rr)]] for rr in GRID] for c in range(N_COPY)])
        yp = np.array([pm[m11.name(b, rr)] for rr in GRID])
        sl = np.polyfit(g, yp, 1)[0]
        slc = np.array([np.polyfit(g, y, 1)[0] for y in ys])
        slopes[b] = dict(slope=round(float(sl), 5), se=round(float(slc.std(ddof=1) / np.sqrt(N_COPY)), 5))
        p(f"  slope of pooled median on rho, {b:22s} {sl * 100 / 10:+.3f} point per 0.1 of recall (se {slopes[b]['se'] * 10:.3f})")

    h40 = bool((se <= 0.002).all())
    sh = {}
    for rr in GRID:
        x = m11.name("adaptive-dd-0.5-s0.75", rr)
        degw = worst_regret(r, ref_idx, lambda q: E[q][[k["degree"]]])[0][:, 0]
        sh[rr] = float((pooled[:, ki[x]] < degw).mean())
    h41 = bool(all(pm[m11.name("adaptive-dd-0.5-s0.75", rr)] <= 0.03 and sh[rr] >= 0.9 for rr in GRID))
    p(f"\nH38 (no adjacent pair where more recall scores worse by > 2 MC se): {'held' if h38 else 'refuted'}")
    p(f"H39 (census dd at 0.85 no more than 2 se above 0.75): {'held' if h39 else 'refuted'}; "
      f"{d39 * 100:+.2f}, 2 se = {2 * s39 * 100:.2f}")
    p(f"H40 (every pooled median has MC se <= 0.20 point with ten copies): {'held' if h40 else 'refuted'}; "
      f"max {se.max() * 100:.2f} ({KEY[int(np.argmax(se))]})")
    p("H41 (half survey at every rho in 0.7-0.9: pooled median <= 3% and beats perfect census top degree in >= 90%): "
      f"{'held' if h41 else 'refuted'}; " + ", ".join(
          f"{rr}: {pm[m11.name('adaptive-dd-0.5-s0.75', rr)] * 100:.2f}% / {sh[rr]:.3f}" for rr in GRID))
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"key": KEY, "grid": GRID, "rows": rows, "adjacent": adj, "slopes": slopes,
               "sanity_m14": [d0, d14], "hits": [hits, hp],
               "h38": h38, "h39": [d39, s39, s39_5, h39], "h40": [float(se.max()), h40],
               "h41": [{str(rr): [pm[m11.name('adaptive-dd-0.5-s0.75', rr)], sh[rr]] for rr in GRID}, h41],
               "ref": {"dd-0.05": dd_ref, "degree": deg_ref}},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
