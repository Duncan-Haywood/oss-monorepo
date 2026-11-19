"""Milestone 7ad verdicts AD1-AD8 (predictions in ../../LOG.md) and the summary table, from results.json and 7ac's results.json.

Unsettled (simulator): more than half of a design's 64 step episodes end outside the 5 cm band (7y's settle time is NaN).
Unsettled (model): model.py's mean distance over the last second above 5 cm. Identified total: L2-45 diverged flights (lever 2,
45 deg, cap) summed over the 33, 36 and 39.1 ms laws. Medians over designs of each design's median over episodes.
Post hoc: paired Wilcoxon signed-rank (scipy if present) of b against None, per design."""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SFX = "_smoke" if os.environ.get("SMOKE") == "1" else ""
R = json.load(open(os.path.join(HERE, f"results{SFX}.json")))
BASE = json.load(open(os.path.join(HERE, "..", "m7ac_ceil125", "results.json")))
ID = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
MID = ID[1]
GEOMS = ("above", "below")
SETS = ("aware lag39", "aware lag39c100", "aware lag39c125", "aware lag39c150", "aware lag39c200", "aware lag75")
LAWS8 = sorted({r["law_name"] for r in BASE["runs"]})
CONDS = ("45_1_cap", "20_2_cap", "45_2_cap", "20_3_cap")


def key(r):
    return (r["set"], r["geom"], r["seed"])


def nan(v):
    return v is None or (isinstance(v, float) and math.isnan(v))


def unsettled(r):
    return float(np.mean([nan(v) for v in r["settle"]])) > 0.5


def med(v):
    v = np.array([np.nan if x is None else x for x in v], float)
    return float(np.nanmedian(v)) if np.isfinite(v).any() else float("nan")


def resp(rs, band, test, law=MID):
    return {key(r): r for r in rs if r.get("band") == band and r["test"] == test and r["law_name"] == law}


def wilcoxon(a, b):
    try:
        from scipy.stats import wilcoxon as W
        return float(W(a, b).pvalue)
    except Exception:
        return float("nan")


def ident(runs, band=None):
    return sum(r["dead_45_2_cap"] for r in runs if r.get("band", None) == band and r["law_name"] in ID and r["set"] in SETS)


def main():
    L, V = [], []
    calls = {key(c): c for c in R["calls"]["held"]}
    # Part A
    held = resp(R["resp_held"], None, "step")
    agree = sum(unsettled(r) == (calls[k]["model_tail"] > 0.05) for k, r in held.items())
    sim_tail = np.array([med(held[k]["tail_off"]) for k in held]); mod_tail = np.array([calls[k]["model_tail"] for k in held])
    r_ = float(np.corrcoef(sim_tail, mod_tail)[0, 1])
    by_law = {law: resp(R["resp_held"], None, "step", law) for law in ID}
    same = sum(len({unsettled(by_law[law][k]) for law in ID}) == 1 for k in held)
    n_sim = sum(unsettled(r) for r in held.values()); n_mod = int((mod_tail > 0.05).sum())
    L += ["Part A: step test on 96 designs never response-tested (36 ms law unless stated)",
          f"  unsettled: simulator {n_sim}, model {n_mod}; calls agree on {agree} of {len(held)}; r(model, simulator last-second distance) {r_:.4f}",
          f"  simulator call identical at 33, 36 and 39.1 ms for {same} of {len(held)}"]
    for s in sorted({k[0] for k in held}):
        ks = [k for k in held if k[0] == s]
        L.append(f"  {s:15s} unsettled sim {sum(unsettled(held[k]) for k in ks):2d}, model {sum(calls[k]['model_tail'] > 0.05 for k in ks):2d} of {len(ks)}"
                 f"; disagree {[(k[1], k[2]) for k in ks if unsettled(held[k]) != (calls[k]['model_tail'] > 0.05)]}")
    miss = sorted(((k, med(held[k]["tail_off"]), calls[k]["model_tail"], calls[k]["ki"] / calls[k]["kp"]) for k in held
                   if unsettled(held[k]) != (calls[k]["model_tail"] > 0.05)), key=lambda z: z[1])
    for k, a, b, q in miss:
        L.append(f"    miss {k}: simulator {a:.4f} m, model {b:.4f} m, ki/kp {q:.3f}")
    V += [("AD1", agree >= 90, f"{agree} of 96 agree (need 90)"), ("AD2", r_ >= 0.95, f"r {r_:.4f} (need 0.95)"),
          ("AD3", same >= 94, f"{same} of 96 law-invariant (need 94)")]
    # Reproduction: b = None against 7ac
    old = {(key(r), r["test"], r["law_name"]): r for r in BASE["resp"]}
    new = [r for r in R["resp"] if r["band"] is None]
    mism = sum(1 for r in new for f in ("settle", "rise", "over", "peak", "resid", "tail_off") if f in r and
               json.dumps(r[f]) != json.dumps(old[(key(r), r["test"], r["law_name"])][f]))
    L += ["", f"Reproduction: b = None response flights against 7ac's results.json: {len(new)} flights, {mism} field mismatches"]
    # Part B
    L += ["", "Part B: conditional integration on 7ac's 72 designs (36 ms law; medians over designs; per geometry above, below)"]
    st = {b: resp(R["resp"], b, "step") for b in (None,) + tuple(R["bands"])}
    w6 = {b: resp(R["resp"], b, "wind6") for b in st}
    w3 = {b: resp(R["resp"], b, "wind3") for b in st}
    ks = sorted(st[None])
    for b in st:
        g = lambda f, t=st, gg=None: [med([med(t[b][k][f]) for k in ks if gg is None or k[1] == gg]) for gg in GEOMS]
        L.append(f"  b = {b}: unsettled {sum(unsettled(st[b][k]) for k in ks)} of 72 "
                 f"({', '.join(str(sum(unsettled(st[b][k]) for k in ks if k[0] == s)) for s in SETS)} by set); "
                 f"last-second distance {g('tail_off')[0]:.4f}, {g('tail_off')[1]:.4f} m; rise {g('rise')[0]:.3f}, {g('rise')[1]:.3f} s; "
                 f"overshoot {g('over')[0]:.4f}, {g('over')[1]:.4f} m; wind6 peak {g('peak', w6)[0]:.4f}, {g('peak', w6)[1]:.4f} m, "
                 f"residual {g('resid', w6)[0]:.4f}, {g('resid', w6)[1]:.4f} m; wind3 peak {g('peak', w3)[0]:.4f}, {g('peak', w3)[1]:.4f} m; "
                 f"dead {sum(st[b][k]['dead'] for k in ks)}")
    base_id = ident(BASE["runs"])
    idt = {b: ident(R["runs"], b) for b in R["bands"]}
    L += ["", f"Stress (held-out, seed {R['test_seed']}): identified total over 72 designs, b = None (7ac) {base_id}; "
          + "; ".join(f"b = {b} {idt[b]}" for b in R["bands"])]
    hdr = "  set / geometry         " + "  ".join(f"{b!s:>16s}" for b in (None,) + tuple(R["bands"]))
    L.append(hdr + "   (identified total; at 75 ms; median J_45_1 at 36 ms)")
    for s in SETS:
        for gg in GEOMS:
            cells = []
            for b in (None,) + tuple(R["bands"]):
                rr = [r for r in (BASE["runs"] if b is None else R["runs"]) if r.get("band", None) == b and r["set"] == s and r["geom"] == gg]
                cells.append(f"{sum(r['dead_45_2_cap'] for r in rr if r['law_name'] in ID):4d} {sum(r['dead_45_2_cap'] for r in rr if r['law_name'] == 'stress 75 ms D^0'):4d} "
                             f"{med([r['J_45_1_cap'] for r in rr if r['law_name'] == MID]):6.3f}")
            L.append(f"  {s:16s} {gg:6s} " + "  ".join(f"{c:>16s}" for c in cells))
    for law in LAWS8:
        row = [sum(r[f"dead_{c}"] for r in BASE["runs"] if r["law_name"] == law) for c in CONDS]
        rows = [[sum(r[f"dead_{c}"] for r in R["runs"] if r["band"] == b and r["law_name"] == law) for c in CONDS] for b in R["bands"]]
        L.append(f"  law {law:24s} dead by condition {CONDS}: None {row}; " + "; ".join(f"{b} {x}" for b, x in zip(R["bands"], rows)))
    peak_ok = all(abs(med([med(w6[0.25][k]["peak"]) for k in ks if k[1] == gg]) / med([med(w6[None][k]["peak"]) for k in ks if k[1] == gg]) - 1) < 0.10
                  for gg in GEOMS)
    n25 = sum(unsettled(st[0.25][k]) for k in ks)
    ov = {b: med([med(st[b][k]["over"]) for k in ks]) for b in (None, 0.25)}
    V += [("AD4", n25 <= 1, f"{n25} of 72 unsettled at b = 0.25 (need at most 1)"),
          ("AD5", peak_ok, "6 m/s wind-step peak within 10% of b = None in both geometries" if peak_ok else "peak moved 10% or more"),
          ("AD6", idt[0.25] <= 902, f"identified total {idt[0.25]} (need at most 902; None {base_id})"),
          ("AD7", idt[0.1] > idt[0.25], f"b = 0.1: {idt[0.1]} against b = 0.25: {idt[0.25]}"),
          ("AD8", ov[0.25] < ov[None], f"median overshoot {ov[0.25]:.4f} against {ov[None]:.4f} m")]
    # post hoc paired tests
    L += ["", "Post hoc (paired by design, Wilcoxon signed-rank, two-sided):"]
    for b in R["bands"]:
        for f, t in (("tail_off", st), ("over", st), ("rise", st), ("peak", w6), ("resid", w6)):
            a = [med(t[b][k][f]) for k in ks]; c = [med(t[None][k][f]) for k in ks]
            L.append(f"  b = {b} {('wind6 ' if t is w6 else 'step ') + f:14s} median {np.nanmedian(a):.4f} against {np.nanmedian(c):.4f}, p = {wilcoxon(a, c):.2g}")
        pb = {key(r) + (r["law_name"],): r for r in R["runs"] if r["band"] == b}
        po = {key(r) + (r["law_name"],): r for r in BASE["runs"]}
        a = [sum(pb[k + (l,)]["dead_45_2_cap"] for l in ID) for k in ks]; c = [sum(po[k + (l,)]["dead_45_2_cap"] for l in ID) for k in ks]
        L.append(f"  b = {b} identified L2-45 per design: total {sum(a)} against {sum(c)}, p = {wilcoxon(a, c):.2g}")
        a = [pb[k + (MID,)]["J_45_1_cap"] for k in ks]; c = [po[k + (MID,)]["J_45_1_cap"] for k in ks]
        L.append(f"  b = {b} J_45_1_cap at 36 ms per design: median {np.median(a):.3f} against {np.median(c):.3f}, p = {wilcoxon(a, c):.2g}")
    L += ["", "Verdicts:"] + [f"  {n}: {'held' if ok else 'refuted'} ({why})" for n, ok, why in V]
    out = "\n".join(L) + "\n"
    open(os.path.join(HERE, f"verdicts{SFX}.txt"), "w").write(out)
    print(out)


if __name__ == "__main__":
    main()
