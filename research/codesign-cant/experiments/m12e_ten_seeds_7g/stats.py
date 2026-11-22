"""Milestone 12e statistics (stdlib): the lever-2 authority probes at ten seeds per set.

Reads results.json from run.py. Per set (geometry x training arm), tilt-command limit and probe: diverged flights summed over
the ten seeds (of 640) with the per-seed counts and a bootstrap 95% interval over seeds (20,000 resamples, seed 0); the
paired change from base per design with the exact two-sided Wilcoxon signed-rank p (12d's exact DP, zeros dropped); and, for the
base run, 7g's diagnosis: why each flight died (tilt or position), the gust torque's peak over the plant's torque limit in
diverged (D) and surviving (S) flights, and the share of D flights whose gust torque exceeds the limit at some alive step.
"margin sets" pools the three above sets M = 1.25, 1.43, 1.67 (30 designs, of 1,920). Writes stats.txt and stats.json.
"""
import importlib.util, json, os, random, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m12d_stats", os.path.join(HERE, "..", "m12d_ten_seeds_c200", "stats.py"))
D12 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(D12)
wilcoxon = D12.wilcoxon
B = 20000
GROUPS = [("above", "unconstrained", ("unconstrained",)), ("above", "M=1.25", ("M=1.25",)), ("above", "M=1.43", ("M=1.43",)),
          ("above", "M=1.67", ("M=1.67",)), ("above", "margin sets", ("M=1.25", "M=1.43", "M=1.67")),
          ("below", "unconstrained", ("unconstrained",)), ("below", "M=1.25", ("M=1.25",))]


def boot_total(per_design, rng, strata):
    """Interval of the summed count, resampling designs (seeds) within each stratum (training arm)."""
    groups = [[c for c, s in zip(per_design, strata) if s == k] for k in sorted(set(strata))]
    t = sorted(sum(sum(rng.choice(g) for _ in g) for g in groups) for _ in range(B))
    return t[int(0.025 * B)], t[int(0.975 * B) - 1]


def median(v):
    return statistics.median(v) if v else float("nan")


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    rng = random.Random(0)
    ep = R["episodes"]
    L = [f"Milestone 12e: lever {R['lever']:g}, {ep} held-out episodes (seed {R['test_seed']}), integrator feed-forward, side force on; ten seeds per set.",
         "dead = diverged flights summed over designs [95% bootstrap interval over seeds]; per-seed counts in seed order 0-9;",
         "vs base = paired change per design, mean, exact Wilcoxon p, designs better/worse.", ""]
    out = {}
    for geom, name, labs in GROUPS:
        L.append(f"[{geom}, {name}]")
        for cap in R["caps"]:
            rows = {o["probe"]: o for o in R["runs"] if o["geom"] == geom and o["cap"] == cap}
            base = rows["base"]
            idx = sorted([i for i, l in enumerate(base["labels"]) if l in labs], key=lambda i: (base["labels"][i], base["seeds"][i]))
            strata = [base["labels"][i] for i in idx]
            per0 = [sum(base["dead"][i]) for i in idx]
            cell = {}
            for probe in R["probes"]:
                o = rows[probe]
                per = [sum(o["dead"][i]) for i in idx]
                lo, hi = boot_total(per, rng, strata)
                d = [a - b for a, b in zip(per, per0)]
                p, _ = wilcoxon(d)
                cell[probe] = dict(total=sum(per), of=len(idx) * ep, lo=lo, hi=hi, per=per, p=p,
                                   better=sum(x < 0 for x in d), worse=sum(x > 0 for x in d))
                tail = "" if probe == "base" else (f"; vs base {statistics.mean(d):+.2f} per design, p={p:.4f}, "
                                                    f"better {cell[probe]['better']} worse {cell[probe]['worse']}")
                L.append(f"  cap {cap:2g} {probe:26s} dead {sum(per):3d} of {len(idx) * ep} [{lo}, {hi}] {per if len(per) <= 10 else ''}{tail}")
            dg = base["diag"]
            Dm = [(i, e) for i in idx for e in range(ep) if base["dead"][i][e]]
            Sm = [(i, e) for i in idx for e in range(ep) if not base["dead"][i][e]]
            why = [dg["dead_why"][i][e] for i, e in Dm]
            pk = lambda m: [dg["gust_peak"][i][e] for i, e in m]
            mix = lambda m: [dg["mix_rp"][i][e] for i, e in m]
            diag = dict(n_dead=len(Dm), tilt=sum(w == 1 for w in why), pos=sum(w == 2 for w in why),
                        peak_D=median(pk(Dm)), peak_S=median(pk(Sm)),
                        over_D=(sum(x > 1 for x in pk(Dm)) / len(Dm)) if Dm else float("nan"),
                        over_S=sum(x > 1 for x in pk(Sm)) / len(Sm), mix_D=median(mix(Dm)), mix_S=median(mix(Sm)),
                        episodes=len(set(e for _, e in Dm)))
            cell["diag"] = diag
            L.append(f"         base diagnosis: why tilt {diag['tilt']} / pos {diag['pos']}; gust peak / limit D {diag['peak_D']:.2f} S {diag['peak_S']:.2f}; "
                     f"over D {diag['over_D']:.2f} S {diag['over_S']:.3f}; mixer scaling D {diag['mix_D']:.2f} S {diag['mix_S']:.2f}; distinct episodes {diag['episodes']}")
            out[f"{geom}|{name}|{cap:g}"] = cell
        L.append("")
    open(os.path.join(HERE, "stats.txt"), "w").write("\n".join(L) + "\n")
    json.dump(out, open(os.path.join(HERE, "stats.json"), "w"), indent=1)
    print("\n".join(L))


if __name__ == "__main__":
    main()
