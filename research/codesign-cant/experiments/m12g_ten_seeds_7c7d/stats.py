"""Milestone 12g statistics (stdlib): milestones 7c and 7d at ten seeds per set.

Reads results.json from run.py. 7c part: per set (geometry x label), ki/kp, ceiling multiples, worst-held-out-plant growth
rate (ln rho / DT), predicted-unstable share and diverged counts at levers 0 and 1; the confusion table of "unstable at this
flight's plant" against divergence for the 7b design-conditions, milestone 7's designs and the rescaled designs, over ten
seeds and over seeds 6-9 alone. 7d part: per set, clip arm, horizon and lever, diverged flights (of 640), median saturation
shares; the linear iteration from the offset; and the tilt-command sweep. Bootstrap 95% intervals (20,000 resamples over
designs, seed 0) for the shares named in MG6, MG7 and MG10. Writes stats.txt and stats.json; prints the MG verdict inputs.
"""
import json, math, os, random, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
DT = 0.002                                   # aero.DT
B = 20000
LABELS = ["6b aware", "6b+integ", "integ retrained", "integ retrained, ff off", "m7 cmd-ff",
          "6b+integ, ki 0.8x ceiling", "6b+integ, ki 1.25x ceiling"]


def f2(v):
    return ", ".join(f"{x:.2f}" for x in v)


def confusion(cs, lev):
    tp = fp = fn = tn = 0
    for c in cs:
        for r, d in zip(c["rho_ep"], c[f"dead_{lev:g}"]):
            u, d = r >= 1.0, d > 0
            tp += u and d; fp += u and not d; fn += (not u) and d; tn += (not u) and not d
    n = tp + fp + fn + tn
    return dict(tp=tp, fp=fp, fn=fn, tn=tn, acc=(tp + tn) / max(n, 1), sens=tp / max(tp + fn, 1), n=n)


def boot_share(num, den, rng):
    """Interval of sum(num) / sum(den), resampling designs."""
    idx = range(len(num))
    t = []
    for _ in range(B):
        s = [rng.choice(idx) for _ in idx]
        t.append(sum(num[i] for i in s) / max(sum(den[i] for i in s), 1))
    t.sort()
    return t[int(0.025 * B)], t[int(0.975 * B) - 1]


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    rng = random.Random(0)
    ep = R["test_ep"]
    conds = R["conds"]
    out = dict(sets={}, confusion={}, m7d={}, tilt={})
    L = [f"Milestone 12g: milestones 7c and 7d at ten seeds per set; {ep} held-out episodes (seed {R['test_seed']}) per design.",
         "ceil = ki ceiling multiple (4.00 = stable at 4x; 0 = unstable at ki 0); growth = ln(rho) / DT at the worst held-out plant (1/s);",
         "pred = share of held-out plants with rho >= 1; dead L0 / L1 = diverged held-out flights per design at lever 0 / 1.", ""]
    for c in R["checks"]:
        L.append(("CHECK ok   " if c["ok"] else "CHECK FAIL ") + f"{c['what']}: got {c['got']}, want {c['want']}")
    L.append("")
    for g in ("above", "below"):
        for lab in LABELS:
            cs = sorted((c for c in conds if c["geom"] == g and c["label"] == lab), key=lambda c: c["seed"])
            if not cs:
                continue
            pred = [sum(r >= 1.0 for r in c["rho_ep"]) / len(c["rho_ep"]) for c in cs]
            gr = [math.log(max(c["rho_ep"])) / DT for c in cs]
            d0, d1 = [sum(c["dead_0"]) for c in cs], [sum(c["dead_1"]) for c in cs]
            ceil = [c["ceil"] for c in cs]
            L.append(f"[{g}, {lab}] seeds {[c['seed'] for c in cs]}")
            L.append(f"  ki/kp {f2([c['ki_kp'] * c['ki_scale'] for c in cs])}; ceil {f2(ceil)}")
            L.append(f"  pred {f2(pred)}; growth {f2(gr)}")
            L.append(f"  dead L0 {d0} (total {sum(d0)} of {ep * len(cs)}); dead L1 {d1} (total {sum(d1)})")
            L.append(f"  median pos RMS at lever 0 (m) {statistics.median(statistics.median(c['pos_0']) for c in cs):.3f}")
            out["sets"][f"{g}|{lab}"] = dict(seeds=[c["seed"] for c in cs], ceil=ceil, pred=pred, growth=gr, dead0=d0, dead1=d1,
                                             unstable=[sum(r >= 1.0 for r in c["rho_ep"]) for c in cs])
        L.append("")
    for name, sel in (("7b design-conditions", lambda c: c["set"] == "7b"), ("m7 cmd-ff designs", lambda c: c["set"] == "7"),
                      ("rescaled designs", lambda c: c["set"] == "new")):
        for part, ps in (("seeds 0-9", range(10)), ("seeds 6-9", range(6, 10))):
            cs = [c for c in conds if sel(c) and c["seed"] in ps]
            for lev in (0.0, 1.0):
                k = confusion(cs, lev)
                out["confusion"][f"{name}|{part}|{lev:g}"] = k
                L.append(f"{name} ({part}, {len(cs)} x {ep}), lever {lev:g}: unstable&dead {k['tp']}, unstable&alive {k['fp']}, "
                         f"stable&dead {k['fn']}, stable&alive {k['tn']}; accuracy {k['acc']:.3f}, sensitivity {k['sens']:.3f}")
    fa = {}
    for c in conds:
        if c["set"] != "7b":
            continue
        n = sum(r >= 1.0 and d == 0 for r, d in zip(c["rho_ep"], c["dead_0"]))
        if n:
            fa[f"{c['geom']}|{c['label']}"] = fa.get(f"{c['geom']}|{c['label']}", 0) + n
    L.append(f"7b false alarms at lever 0 by set: {fa}")
    out["false_alarms_7b_L0"] = fa
    m7 = [c for c in conds if c["set"] == "7"]
    dd = [(c["geom"], c["seed"], sum(c["dead_0"]), max(c["rho_ep"])) for c in m7 if sum(c["dead_0"]) > 0]
    L.append(f"m7 designs with a diverged lever-0 flight (geom, seed, dead, max rho): {[(g, s, d, round(r, 5)) for g, s, d, r in dd]}")
    out["m7_dead_designs"] = dd
    L.append("")

    M = R["m7d"]
    meta = M["conds"]
    sets = ["bolted", "1.25x", "0.8x", "retrained"]
    unst = [[r >= 1.0 for r in m["rho_ep"]] for m in meta]
    L.append("7d: the 40 above integrator-mode design-conditions (feed-forward on); dead of 640 per set; sat = median share of alive steps.")
    for s in sets:
        idx = [i for i, m in enumerate(meta) if m["set"] == s]
        nu = sum(sum(unst[i]) for i in idx)
        L.append(f"[{s}] seeds {[meta[i]['seed'] for i in idx]}; linear-unstable {nu} of {ep * len(idx)}")
        for o in M["runs"]:
            dead = [sum(o["dead"][i]) for i in idx]
            sat = " ".join(f"{k.split('_')[0]} {statistics.median(v for i in idx for v in o[k][i]):.3f}"
                           for k in ("integ_at_clip", "ffi_at_clip", "tilt_at_clip", "mix_rp"))
            L.append(f"  {o['clip']:5s} {o['hz']:2d} s lever {o['lev']:g}: dead {dead} (total {sum(dead)}); "
                     f"pos {statistics.median(o['pos'][i][e] for i in idx for e in range(ep)):.3f}; sat {sat}")
            out["m7d"][f"{s}|{o['clip']}|{o['hz']}|{o['lev']:g}"] = dict(dead=dead, total=sum(dead),
                                                                          integ_med=statistics.median(v for i in idx for v in o["integ_at_clip"][i]))
        lt = [M["lin_death"][i] for i in idx]
        by = lambda t: sum(1 for i, row in zip(idx, lt) for e, x in enumerate(row) if 0 <= x <= t and unst[i][e])
        L.append(f"  linear model from offset only: of {nu} linear-unstable flights, {by(6)} reach 5 m / 60 deg by 6 s, {by(18)} by 18 s")
        out["m7d"][f"{s}|linear"] = dict(unstable=nu, by6=by(6), by18=by(18))
    L.append("")
    L.append("Tilt-command sweep (7d post hoc, here planned): lever 0, integrator and feed-forward clips at defaults.")
    for s in sets:
        idx = [i for i, m in enumerate(meta) if m["set"] == s]
        L.append(f"[{s}]")
        for o in M["tilt"]:
            dead = [sum(o["dead"][i]) for i in idx]
            att = statistics.mean(o["att"][i] for i in idx)
            L.append(f"  clip {o['cap']:4.0f} deg, {o['hz']:2d} s: dead {dead} (total {sum(dead)} of {ep * len(idx)}); "
                     f"pos {statistics.median(o['pos'][i][e] for i in idx for e in range(ep)):.3f}; att {att:.2f}")
            per_unst = [sum(1 for e in range(ep) if o["dead"][i][e] and unst[i][e]) for i in idx]
            nus = [sum(unst[i]) for i in idx]
            rec = dict(dead=dead, total=sum(dead), dead_and_unstable=sum(per_unst), unstable=sum(nus), att=att)
            if (s, o["cap"]) in (("1.25x", 45.0), ("retrained", 45.0)):
                rec["ci_share_of_all"] = boot_share(dead, [ep] * len(idx), rng)
                rec["ci_share_of_unstable"] = boot_share(per_unst, nus, rng)
                L.append(f"    share of all {sum(dead) / (ep * len(idx)):.3f} [{rec['ci_share_of_all'][0]:.3f}, {rec['ci_share_of_all'][1]:.3f}]; "
                         f"dead among linear-unstable {sum(per_unst)} of {sum(nus)} = {sum(per_unst) / max(sum(nus), 1):.3f} "
                         f"[{rec['ci_share_of_unstable'][0]:.3f}, {rec['ci_share_of_unstable'][1]:.3f}]")
            out["tilt"][f"{s}|{o['cap']:g}|{o['hz']}"] = rec
        L.append("")
    open(os.path.join(HERE, "stats.txt"), "w").write("\n".join(L) + "\n")
    json.dump(out, open(os.path.join(HERE, "stats.json"), "w"), indent=1)
    print("\n".join(L))


if __name__ == "__main__":
    main()
