"""Milestone 91 analysis: a pre-registered family of float32 arbiter threshold rules, chosen on the selection seeds
(200 to 239, milestone 90's test seeds) by the worst-zone conviction of one forged float16 step, then evaluated on
fresh holdout seeds 300 to 339. Rules, each per statistic and per zone of 5 segments, a segment convicted when any
statistic exceeds its threshold:
  MAX(k, C)     k x zone maximum of the honest calibration values
  Q(p, k, C)    k x zone p-quantile
  LOG(k, C)     exp(median log + k x 1.4826 x MAD log)
with C = C40 (seeds 100 to 139) or C80 (100 to 179). Reads results.json (run.py) and ../arbiter_audit/summary.json
(milestone 90, control T1); writes results.txt and summary.json. Rules and predictions are LOG.md's, fixed before."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ZONE = 5
STATS = {"sgd": ("w",), "momentum": ("w", "m"), "adam": ("w", "m", "v")}
ADMIT = 3  # honest convictions allowed per 3,000-segment cell on the selection set
BLIND = [("momentum", "cosine", 0), ("sgd", "cosine", 5), ("sgd", "cosine", 10), ("sgd", "cosine", 14),
         ("adam15", "sgdr", 7)]  # milestone 90's whole-zone misses
BASE = "MAX(10,C40)"


def rules():
    out = []
    for c in ("C40", "C80"):
        out += [(f"MAX({k},{c})", "max", None, k, c) for k in (2, 3, 5, 10)]
        out += [(f"Q({p},{k},{c})", "q", p, k, c) for p in (0.99, 0.95, 0.5) for k in (3, 5, 10, 20, 50, 100, 200)]
        out += [(f"LOG({k},{c})", "log", None, k, c) for k in (4, 6, 8, 10, 12)]
    return out


def zone_stat(cal, fn):
    """cal: seeds x N -> per-segment vector of fn over the zone's calibration values."""
    n = cal.shape[1]
    return np.repeat([fn(cal[:, z:z + ZONE].ravel()) for z in range(0, n, ZONE)], ZONE)[:n]


def threshold(cal, kind, p, k):
    if kind == "max":
        return k * zone_stat(cal, np.max)
    if kind == "q":
        return k * zone_stat(cal, lambda v: float(np.quantile(v, p, method="higher")))
    if kind == "log":
        def f(v):
            lv = np.log(np.maximum(v, 1e-30))
            med = float(np.median(lv))
            return float(np.exp(med + k * 1.4826 * np.median(np.abs(lv - med))))
        return zone_stat(cal, f)
    raise ValueError(kind)


def arr(runs, seeds, stat, key):
    return np.array([runs[str(s)]["reorder"][stat][key] for s in seeds], dtype=float)


def conv_stats(conv):
    """conv: seeds x N bool -> mean, worst-zone rate, worst zone index, per-zone rates."""
    n = conv.shape[1]
    z = np.array([conv[:, i:i + ZONE].mean() for i in range(0, n, ZONE)])
    return float(conv.mean()), float(z.min()), int(z.argmin()), z


def analyze(res):
    cal_sets = {"C40": res["cal_seeds"], "C80": res["cal_seeds"] + res["cal2_seeds"]}
    sets = {"sel": res["dev_seeds"], "hold": res["hold_seeds"]}
    rl = rules()
    out = {"cells": {}, "rules": [r[0] for r in rl]}
    for opt, scheds in res["runs"].items():
        ss = STATS[res["opts"][opt][0]]
        for sc, runs in scheds.items():
            keys = list(runs[str(sets["sel"][0])]["reorder"]["w"])
            cal = {c: {s: arr(runs, seeds, s, "honest") for s in ss} for c, seeds in cal_sets.items()}
            x = {st: {k: {s: arr(runs, seeds, s, k) for s in ss} for k in keys} for st, seeds in sets.items()}
            cell = {"diag": {}, "rules": {}}
            for s in ss:
                c = cal["C40"][s]
                mx = zone_stat(c, np.max)[::ZONE]
                q95 = zone_stat(c, lambda v: float(np.quantile(v, 0.95, method="higher")))[::ZONE]
                cell["diag"][s] = {"max_over_q95": [float(a / b) for a, b in zip(mx, q95)]}
            for name, kind, p, k, c in rl:
                thr = {s: threshold(cal[c][s], kind, p, k) for s in ss}
                r = {}
                for st in sets:
                    r[st] = {}
                    for key in keys:
                        conv = np.any([x[st][key][s] > thr[s] for s in ss], axis=0)
                        mean, worst, wz, _ = conv_stats(conv)
                        r[st][key] = {"mean": mean, "worst": worst, "wz": wz, "count": int(conv.sum())}
                cell["rules"][name] = r
            out["cells"][f"{opt}/{sc}"] = cell
    return out


def select(out):
    cells = out["cells"]
    rows = []
    for name in out["rules"]:
        hon = [cells[c]["rules"][name]["sel"]["honest"]["count"] for c in cells]
        if max(hon) > ADMIT:
            continue
        w = min(cells[c]["rules"][name]["sel"]["f16_1"]["worst"] for c in cells)
        m = min(cells[c]["rules"][name]["sel"]["f16_1"]["mean"] for c in cells)
        rows.append((name, w, m, sum(hon)))
    best_w = max(r[1] for r in rows)
    tied = [r for r in rows if r[1] >= best_w - 0.005]
    best_m = max(r[2] for r in tied)
    tied = [r for r in tied if r[2] >= best_m - 0.005]
    tied.sort(key=lambda r: (r[3], -r[1], -r[2]))
    return tied[0][0], sorted(rows, key=lambda r: (-r[1], -r[2], r[3]))


def report(res, out, m90):
    cells = out["cells"]
    ma = [c for c in cells if not c.startswith("sgd/")]
    sg = [c for c in cells if c.startswith("sgd/")]
    qs = res["qs"]
    sel, ranked = select(out)
    out["selected"] = sel
    L = ["Milestone 91. Float32 arbiter threshold rules, per statistic and zone of 5 segments, on milestone 89's forgeries.",
         "Calibration C40 = seeds 100-139, C80 = 100-179; selection set 200-239 (milestone 90's test seeds);",
         "holdout 300-339 (fresh). 3,000 segments per cell and set. 'worst' = conviction rate of the least-convicted",
         "zone (15 zones of 200 segments). Admissible: at most 3 honest convictions per cell on the selection set.", ""]
    t1 = all(cells[f"{o}/{s}"]["rules"][BASE]["sel"][k]["mean"] == m90[o][s]["cells"][k]["B"]
             for o in m90 for s in m90[o] for k in m90[o][s]["cells"])
    L.append(f"T1 control: {BASE} on the selection set equals milestone 90's B for every cheat and cell: {t1}")
    L.append("")
    L.append("Diagnosis (C40): zone max / zone 0.95 quantile in milestone 90's blind zones, per statistic")
    t2 = True
    for o, s, z in BLIND:
        d = cells[f"{o}/{s}"]["diag"]
        vals = {st: d[st]["max_over_q95"][z] for st in d}
        t2 &= all(v >= 5 for v in vals.values())
        L.append(f"  {o:9s} {s:7s} zone {z:2d}: " + "  ".join(f"{st} {v:.1f}" for st, v in vals.items()))
    L.append("  all zones, median over zones of max/q95 per cell and statistic:")
    for c in cells:
        d = cells[c]["diag"]
        L.append(f"  {c:18s} " + "  ".join(f"{st} {np.median(d[st]['max_over_q95']):.2f} (max "
                                           f"{max(d[st]['max_over_q95']):.1f})" for st in d))
    L.append("")
    L.append(f"Admissible rules on the selection set: {len(ranked)} of {len(out['rules'])}. Ranked by smallest worst-zone"
             " f16_1 conviction over the 16 cells | smallest mean | honest convictions in total (of 48,000):")
    for name, w, m, h in ranked[:25]:
        L.append(f"  {name:20s} {w:.3f} | {m:.3f} | {h}")
    L.append(f"  ... {BASE}: " + (" | ".join(f"{v}" for v in next(((f'{w:.3f}', f'{m:.3f}', h) for n, w, m, h in ranked
                                                                     if n == BASE), ("not admissible",)))))
    inad = [n for n in out["rules"] if n not in {r[0] for r in ranked}]
    L.append(f"  not admissible: {', '.join(inad)}")
    L.append(f"Selected rule: {sel}")
    L.append("")
    for st, lab in (("sel", "selection set"), ("hold", "HOLDOUT")):
        L.append(f"{lab}: honest convictions (of 3,000) | f16_1 mean, worst zone (index) | bf16_1 mean, worst |"
                 " smallest mean over f16/bf16 q >= 2, for " + f"{BASE} then {sel}")
        for c in cells:
            parts = []
            for name in (BASE, sel):
                r = cells[c]["rules"][name][st]
                q2 = min(r[f"{p}_{q}"]["mean"] for p in ("f16", "bf16") for q in qs if q >= 2)
                parts.append(f"{r['honest']['count']:2d} | {r['f16_1']['mean']:.3f} {r['f16_1']['worst']:.3f}"
                             f" ({r['f16_1']['wz']:2d}) | {r['bf16_1']['mean']:.3f} {r['bf16_1']['worst']:.3f} | {q2:.3f}")
            L.append(f"  {c:18s} " + "   ||   ".join(parts))
        L.append("")
    others = ["skip1", "skip2", "sub63_20", "sub56_20"]
    L.append(f"HOLDOUT, other cheats, mean conviction {BASE} / {sel}: " + ", ".join(others))
    for c in cells:
        L.append(f"  {c:18s} " + "  ".join(f"{cells[c]['rules'][BASE]['hold'][k]['mean']:.3f}/"
                                           f"{cells[c]['rules'][sel]['hold'][k]['mean']:.3f}" for k in others))
    L.append("")
    L.append("Best admissible rule per family (selection set), smallest worst-zone f16_1 | smallest mean:")
    for fam in ("MAX(", "Q(0.99", "Q(0.95", "Q(0.5,", "LOG("):
        for c in ("C40", "C80"):
            fr = [r for r in ranked if r[0].startswith(fam) and r[0].endswith(c + ")")]
            L.append(f"  {fam:7s} {c}: " + (f"{fr[0][0]} {fr[0][1]:.3f} | {fr[0][2]:.3f}" if fr else "none admissible"))
    L.append("")

    def g(name, st, c, key, f):
        return cells[c]["rules"][name][st][key][f]
    L.append("Predictions")
    L.append(f"  T1 {'held' if t1 else 'REFUTED'}")
    L.append(f"  T2 {'held' if t2 else 'REFUTED'} (every statistic's zone max >= 5x its 0.95 quantile in every blind zone)")
    adm = {r[0] for r in ranked}
    best3 = max((min(g(n, 'sel', c, 'f16_1', 'worst') for c in ma), n) for n in adm
                if min(g(n, 'sel', c, 'f16_1', 'mean') for c in sg) >= 0.9) if adm else (0, None)
    base_w = min(g(BASE, "sel", c, "f16_1", "worst") for c in ma)
    L.append(f"  T3 {'held' if best3[0] >= 0.8 else 'REFUTED'} (best admissible rule with SGD mean f16_1 >= 0.9:"
             f" {best3[1]}, smallest momentum/Adam worst zone {best3[0]:.3f}; {BASE} {base_w:.3f})")
    L.append(f"  T4 {'held' if not sel.startswith('MAX') else 'REFUTED'} (selected {sel})")
    hh = [g(sel, "hold", c, "honest", "count") for c in cells]
    L.append(f"  T5 {'held' if max(hh) <= 3 and sum(hh) <= 16 else 'REFUTED'} (holdout honest convictions: largest"
             f" {max(hh)} per cell, {sum(hh)} of 48,000 in total)")
    a = min(g(sel, "hold", c, "f16_1", "mean") for c in ma)
    b = min(g(sel, "hold", c, "f16_1", "mean") for c in sg)
    e = min(g(sel, "hold", c, f"{p}_{q}", "mean") for c in cells for p in ("f16", "bf16") for q in qs if q >= 2)
    L.append(f"  T6 {'held' if a >= 0.97 and b >= 0.9 and e >= 0.97 else 'REFUTED'} (holdout f16_1 smallest mean:"
             f" momentum/Adam {a:.3f}, SGD {b:.3f}; f16/bf16 q >= 2 {e:.3f})")
    ws = min(g(sel, "hold", c, "f16_1", "worst") for c in ma)
    wb = min(g(BASE, "hold", c, "f16_1", "worst") for c in ma)
    L.append(f"  T7 {'held' if ws >= 0.8 and wb <= 0.2 else 'REFUTED'} (holdout smallest momentum/Adam worst zone:"
             f" {sel} {ws:.3f}, {BASE} {wb:.3f})")
    b40 = max((r[1] for r in ranked if r[0].endswith("C40)")), default=0.0)
    b80 = max((r[1] for r in ranked if r[0].endswith("C80)")), default=0.0)
    L.append(f"  T8 {'held' if b80 >= b40 else 'REFUTED'} (best admissible worst-zone f16_1: C80 {b80:.3f}, C40"
             f" {b40:.3f})")
    mc = max((g(n, "sel", "momentum/cosine", "f16_1", "worst") for n in adm), default=0.0)
    L.append(f"  Closability line (some admissible rule lifts momentum cosine's worst-zone f16_1 above 0.5 on the"
             f" selection set): {'closable' if mc > 0.5 else 'NOT closable'} (best {mc:.3f})")
    L.append("")
    L.append("== Figure table: HOLDOUT, worst-zone f16_1 conviction per cell; " + f"{BASE} then {sel}")
    for i, c in enumerate(cells):
        L.append(f"  {i + 1} {g(BASE, 'hold', c, 'f16_1', 'worst'):.3f} {g(sel, 'hold', c, 'f16_1', 'worst'):.3f}"
                 f"  # {c}")
    return "\n".join(L) + "\n"


def compact(out):
    """summary.json: every rule's honest counts and f16_1 / bf16_1 figures; every cheat for the baseline and selected."""
    keep = {BASE, out["selected"]}
    small = {"selected": out["selected"], "rules": out["rules"], "cells": {}}
    for c, cell in out["cells"].items():
        rr = {}
        for n, r in cell["rules"].items():
            rr[n] = {st: (r[st] if n in keep else {k: r[st][k] for k in ("honest", "f16_1", "bf16_1")}) for st in r}
        small["cells"][c] = {"diag": cell["diag"], "rules": rr}
    return small


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    m90 = json.load(open(os.path.join(HERE, "..", "arbiter_audit", "summary.json")))
    out = analyze(res)
    txt = report(res, out, m90)
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    json.dump(compact(out), open(os.path.join(HERE, "summary.json"), "w"), indent=1, default=float)
    print(txt)


if __name__ == "__main__":
    main()
