"""Ten-seed statistics for Table VI-1 (milestone 12b): every arm minus the unconstrained arm, in every held-out condition.

Reads results.json (run.py: seeds 0-9 of six arms, scored by milestone 7f's evaluate). For each paired difference of held-out J
(one per seed): mean, a percentile bootstrap 95% interval for the mean (20,000 resamples), the exact two-sided Wilcoxon
signed-rank p and the count of seeds where the arm is better (higher J); divergence counts summed over seeds (of 640), the
ceiling multiples and ki/kp. The test functions are milestone 12's (`../m12_ten_seeds/stats.py`). Also prints the six-seed
(0-5) and ten-seed numbers of Table VI-1 side by side, and the predictions' verdicts. Runs no simulation.
Stdlib only. Run from this directory: python3 stats.py   (writes stats.txt and stats.json)
"""
import importlib.util, json, os, random, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m12_stats", os.path.join(HERE, "..", "m12_ten_seeds", "stats.py"))
T = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(T)

R = json.load(open(os.path.join(HERE, "results.json")))
ARMS = R["arms"]
CONDS = [f"{c:g}_{l:g}" for c in R["caps"] for l in R["levers"]]
TEP = 64


def runs(arm, seeds=range(10)):
    d = {r["seed"]: r for r in R["runs"] if r["label"] == arm}
    return [d[s] for s in seeds]


def table(seeds):
    n = len(list(seeds))
    rows = {"dead_45_0": "diverged, 45 deg, trained lever", "dead_45_2": "diverged, 45 deg, twice the lever"}
    L = [f"| ki bound (x ceiling), {n} seeds | " + " | ".join("none" if a == "unconstrained" else f"{1 / float(a[2:]):.1f}" for a in ARMS) + " |",
         "|---" * (len(ARMS) + 1) + "|"]
    for k, name in rows.items():
        L.append(f"| {name} (of {n * TEP}) | " + " | ".join(str(sum(r[k] for r in runs(a, seeds))) for a in ARMS) + " |")
    base = runs("unconstrained", seeds)
    L.append("| held-out J - unconstrained, 20 deg, trained lever | " + " | ".join(
        f"{statistics.mean(a['J_20_0'] - b['J_20_0'] for a, b in zip(runs(arm, seeds), base)):+.3f}" for arm in ARMS) + " |")
    return L


if __name__ == "__main__":
    rng = random.Random(T.BOOT_SEED)
    out, L = {}, ["Milestone 12b: Table VI-1 at ten seeds (centre of pressure above, integrator feed-forward; held-out 64 episodes, seed 9999).",
                  "Paired: arm minus unconstrained held-out J per seed; mean [bootstrap 95%], exact two-sided Wilcoxon p, seeds better of 10; "
                  "dead = diverged flights summed over seeds, of 640.", ""]
    for c in R["checks"]:
        L.append(f"check {'ok' if c['ok'] else 'FAIL'}: {c['what']}: got {c['got']}, want {c['want']}")
    L.append("")
    base = runs("unconstrained")
    for arm in ARMS:
        rs = runs(arm)
        cs = ", ".join("%.2f" % r["ceil"] for r in rs); kk = ", ".join("%.2f" % r["ki_over_kp"] for r in rs)
        L.append(f"[{arm}] ceil {cs}; ki/kp {kk}; "
                 f"cant {statistics.mean(r['alpha_deg'] for r in rs):.1f} deg; hover W {statistics.mean(r['power'] for r in rs):.0f}")
        out[arm] = {}
        for t in CONDS:
            d = [a[f"J_{t}"] - b[f"J_{t}"] for a, b in zip(rs, base)]
            dead = sum(r[f"dead_{t}"] for r in rs)
            st = T.stat(d, rng, better="pos") if arm != "unconstrained" else None
            out[arm][t] = dict(dead=dead, dead_seeds=[r[f"dead_{t}"] for r in rs], J=statistics.mean(r[f"J_{t}"] for r in rs),
                               pos=statistics.mean(r[f"pos_{t}"] for r in rs), diff=st)
            s = (f"minus unconstrained {st['mean']:+.3f} [{st['lo']:+.3f}, {st['hi']:+.3f}] p={st['p']:.3f} better {st['count']}/10; "
                 if st else "")
            L.append(f"  cap {t.split('_')[0]:>2}, lever {t.split('_')[1]}: J {out[arm][t]['J']:+.3f}; {s}pos {out[arm][t]['pos']:.3f} m; "
                     f"dead {dead} {out[arm][t]['dead_seeds']}")
        L.append("")
    L += ["Table VI-1, seeds 0-5 (as published):"] + table(range(6)) + ["", "Table VI-1, seeds 0-9:"] + table(range(10)) + [""]

    # verdicts, as written in ../../LOG.md before the full run
    ceil = {a: [r["ceil"] for r in runs(a)] for a in ARMS}
    V = {}
    V["MB1"] = all(sum(m <= c <= m + 0.15 for c in ceil[a]) >= 9 for a, m in (("M=1.25", 1.25), ("M=1.43", 1 / 0.7), ("M=1.67", 1 / 0.6))) \
        and sum(0.85 <= c <= 1.15 for c in ceil["unconstrained"]) >= 9
    s = out["M=1.25"]["20_0"]["diff"]
    V["MB2"] = (10 - s["count"]) >= 8 and s["p"] < 0.05 and -0.025 <= s["mean"] <= -0.003
    V["MB3"] = out["M=1.00"]["20_0"]["diff"]["p"] > 0.05
    V["MB4"] = all(out[a]["45_0"]["dead"] <= 1 for a in ("M=1.25", "M=1.43", "M=1.67")) and out["unconstrained"]["45_0"]["dead"] >= 15
    V["MB5"] = out["M=1.11"]["45_0"]["dead"] >= 1
    c2 = [out[a]["45_2"]["dead"] for a in ("M=1.25", "M=1.43", "M=1.67")]
    V["MB6"] = min(c2) >= 10 and max(c2) <= 1.5 * min(c2)
    s = out["M=1.25"]["45_0"]["diff"]
    V["MB7"] = s["mean"] > 0 and s["p"] < 0.05
    # post hoc (written after the results above were read): the 20 deg, lever 0 price without the seeds whose unconstrained
    # design diverged at that condition
    calm = [s_ for s_ in range(10) if runs("unconstrained")[s_]["dead_20_0"] == 0]
    L.append(f"Post hoc: 20 deg, lever 0, arm minus unconstrained over the {len(calm)} seeds whose unconstrained design never diverged there "
             f"(seeds {calm}):")
    out["posthoc_20_0_calm"] = {}
    for arm in ARMS[1:]:
        d = [runs(arm)[s_]["J_20_0"] - base[s_]["J_20_0"] for s_ in calm]
        st = T.stat(d, rng, better="pos")
        out["posthoc_20_0_calm"][arm] = st
        L.append(f"  [{arm}] {st['mean']:+.4f} [{st['lo']:+.4f}, {st['hi']:+.4f}] p={st['p']:.4f} worse in {len(d) - st['count']} of {len(d)}; "
                 f"median of all ten {statistics.median(runs(arm)[s_]['J_20_0'] - base[s_]['J_20_0'] for s_ in range(10)):+.4f}")
    L.append("")
    L.append("Verdicts: " + "; ".join(f"{k} {'held' if v else 'refuted'}" for k, v in V.items()))
    open(os.path.join(HERE, "stats.txt"), "w").write("\n".join(L) + "\n")
    json.dump(dict(arms=out, verdicts=V), open(os.path.join(HERE, "stats.json"), "w"), indent=1)
    print("\n".join(L))
