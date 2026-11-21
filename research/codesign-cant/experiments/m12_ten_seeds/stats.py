"""Ten-seed paired comparisons for milestones 1, 2, 4 and 5, with exact Wilcoxon tests and bootstrap intervals.

Merges milestones 1-2's stored seeds 0-4 (`../m1_allocation`, `../m2_polytope`) with seeds 5-9 from `results.json` (run.py),
and milestone 2's three-start study (seeds 0-4 in `../m2_polytope/restarts.json`; at lam = 0.3 seeds 5-9 are milestone 4's PID
arms, at lam = 1 they are run.py's). Milestones 4 and 5 already have ten seeds and are read as stored. Runs no simulation.

For each paired difference d (one per seed): mean, sample SD, a percentile bootstrap 95% interval for the mean (seeds
resampled with replacement, 20,000 resamples, random.Random(12)), the exact two-sided Wilcoxon signed-rank p (zeros
dropped, average ranks for ties, all 2^n sign patterns enumerated) and the count of seeds in the stated direction.
Stdlib only. Run from this directory: python3 stats.py   (writes results.txt)
"""
import itertools, json, os, random, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
B, BOOT_SEED = 20000, 12


def jload(*p):
    return json.load(open(os.path.join(EXP, *p)))


def ranks(a):
    order = sorted(range(len(a)), key=lambda i: a[i])
    r = [0.0] * len(a); i = 0
    while i < len(a):
        j = i
        while j + 1 < len(a) and a[order[j + 1]] == a[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def wilcoxon(d):
    """Exact two-sided Wilcoxon signed-rank p (zeros dropped)."""
    d = [x for x in d if x != 0]
    n = len(d)
    if n == 0:
        return 1.0
    r = ranks([abs(x) for x in d])
    mid = sum(r) / 2
    obs = abs(sum(ri for ri, x in zip(r, d) if x > 0) - mid)
    hit = sum(abs(sum(ri for ri, s in zip(r, signs) if s) - mid) >= obs - 1e-12 for signs in itertools.product((0, 1), repeat=n))
    return hit / 2 ** n


def boot(d, rng):
    n = len(d)
    ms = sorted(sum(rng.choice(d) for _ in range(n)) / n for _ in range(B))
    return ms[int(0.025 * B)], ms[int(0.975 * B) - 1]


def stat(d, rng, better="neg"):
    lo, hi = boot(d, rng)
    k = sum(x < 0 for x in d) if better == "neg" else sum(x > 0 for x in d)
    return dict(n=len(d), mean=statistics.mean(d), sd=statistics.stdev(d), lo=lo, hi=hi, p=wilcoxon(d), count=k, d=d)


def fmt(label, s, word="better"):
    return (f"  {label:42s} {s['mean']:+6.2f}  [{s['lo']:+6.2f}, {s['hi']:+6.2f}]  sd {s['sd']:4.2f}  p {s['p']:.4f}  "
            f"{word} in {s['count']:2d} of {s['n']}")


def by_seed(rows, **key):
    out = {r["seed"]: r for r in rows if all(r[k] == v for k, v in key.items())}
    return [out[s] for s in sorted(out)]


def pair(a, b, f):
    assert [x["seed"] for x in a] == [y["seed"] for y in b], "seeds must pair"
    return [f(x, y) for x, y in zip(a, b)]


def merged():
    new = json.load(open(os.path.join(HERE, "results.json")))
    m1 = jload("m1_allocation", "results.json")["runs"] + new["m1"]
    m2 = jload("m2_polytope", "results.json")["runs"] + new["m2"]
    m4 = jload("m4_controllers", "results.json")["runs"]
    r = jload("m2_polytope", "restarts.json")
    r += [dict(mix="prio", cap=x["cap"], lam=0.3, seed=x["seed"], start=x["start"], J=x["J"], rms=x["rms"], alpha_deg=x["alpha_deg"],
               power=x["power"]) for x in m4 if x["ctrl"] == "pid" and x["seed"] >= 5]
    r += new["restarts_lam1"]
    return new, m1, m2, r, m4, jload("m5_rotorpy", "results.json")


def main():
    rng = random.Random(BOOT_SEED)
    new, m1, m2, rr, m4, m5 = merged()
    S = {}
    L = ["Ten-seed paired comparisons (seeds 0-9); columns: mean difference, bootstrap 95% interval, SD, exact two-sided Wilcoxon p, seed count",
         "Reproduction checks before the run: " + "; ".join(f"{c['check']}: {'equal' if c['equal'] else 'DIFFERENT'}" for c in new["checks"]), ""]

    L.append("Milestone 1 (m1_allocation): cant arm minus no-cant arm, held-out RMS deg (negative = cant helps)")
    for act, twr in (("prior", "2"), ("prior", "free6"), ("hover", "2"), ("hover", "free6"), ("free", "free6")):
        base = by_seed(m1, cap=0, twr_arm=twr, act=act)
        for cap in (35, 80):
            k = f"m1 {act} TWR {twr} cant<={cap}"
            S[k] = stat(pair(by_seed(m1, cap=cap, twr_arm=twr, act=act), base, lambda x, y: x["rms"] - y["rms"]), rng)
            L.append(fmt(k[3:], S[k]))

    L += ["", "Milestone 2 (m2_polytope, single start): cant <= 80 minus no cant, same mixer and lam (negative = cant better)"]
    for mix, lams in (("box", (0.0, 0.1, 0.3, 1.0)), ("prio", (0.0, 0.1, 0.3, 1.0)), ("prio_free", (0.0, 0.3))):
        for lam in lams:
            a, b = by_seed(m2, mix=mix, cap=80, lam=lam), by_seed(m2, mix=mix, cap=0, lam=lam)
            k = f"m2 {mix} lam {lam} rms"; S[k] = stat(pair(a, b, lambda x, y: x["rms"] - y["rms"]), rng); L.append(fmt(f"{mix} lam {lam} RMS", S[k]))
            k = f"m2 {mix} lam {lam} J"; S[k] = stat(pair(a, b, lambda x, y: y["J"] - x["J"]), rng); L.append(fmt(f"{mix} lam {lam} composite", S[k]))
    L += ["", "Milestone 2: prio minus box, same cant bound and lam (positive = the shared polytope costs accuracy)"]
    for lam in (0.0, 0.1, 0.3, 1.0):
        for cap in (0, 80):
            k = f"m2 prio-box lam {lam} cant<={cap}"
            S[k] = stat(pair(by_seed(m2, mix="prio", cap=cap, lam=lam), by_seed(m2, mix="box", cap=cap, lam=lam), lambda x, y: x["rms"] - y["rms"]), rng, "pos")
            L.append(fmt(k[3:], S[k], "worse"))
    L += ["", "Milestone 2: prio_free minus prio (negative = airmode helps)"]
    for lam in (0.0, 0.3):
        for cap in (0, 80):
            k = f"m2 free-prio lam {lam} cant<={cap}"
            S[k] = stat(pair(by_seed(m2, mix="prio_free", cap=cap, lam=lam), by_seed(m2, mix="prio", cap=cap, lam=lam), lambda x, y: x["rms"] - y["rms"]), rng)
            L.append(fmt(k[3:], S[k]))
    L += ["", "Milestone 2: single-start prio, cant <= 80, chosen cant deg per seed (seeds 0-9) and cells under 15 deg"]
    low = 0
    for lam in (0.1, 0.3, 1.0):
        cs = [r["alpha_deg"] for r in by_seed(m2, mix="prio", cap=80, lam=lam)]
        n = sum(c < 15 for c in cs); low += n
        L.append(f"  lam {lam}: {', '.join(f'{c:.0f}' for c in cs)}  (under 15 deg: {n} of 10; seeds 5-9: {sum(c < 15 for c in cs[5:])})")
    L.append(f"  lam 0.1-1 together: {low} of 30 seed-lam cells under 15 deg")
    S["m2 low cant cells"] = low

    L += ["", "Milestone 2b (three starts; lam 0.3 seeds 5-9 = milestone 4's PID arms): cant <= 80 minus no cant, prio"]
    for lam in (0.3, 1.0):
        a, b = by_seed(rr, cap=80, lam=lam), by_seed(rr, cap=0, lam=lam)
        k = f"m2b lam {lam} rms"; S[k] = stat(pair(a, b, lambda x, y: x["rms"] - y["rms"]), rng); L.append(fmt(f"lam {lam} RMS", S[k]))
        k = f"m2b lam {lam} J"; S[k] = stat(pair(a, b, lambda x, y: y["J"] - x["J"]), rng); L.append(fmt(f"lam {lam} composite", S[k]))
        cants = ", ".join("%.0f" % x["alpha_deg"] for x in a)
        L.append(f"  lam {lam} chosen cant deg: {cants}")

    L += ["", "Milestone 4 (m4_controllers, stored ten seeds): Table IV-1"]
    sel = lambda c, cap: by_seed(m4, ctrl=c, cap=cap)
    for c in ("pid", "indi", "geo"):
        for key, f in (("rms", lambda x, y: x["rms"] - y["rms"]), ("J", lambda x, y: y["J"] - x["J"]), ("gust8", lambda x, y: x["rms_gust8"] - y["rms_gust8"])):
            k = f"m4 {c} cant {key}"; S[k] = stat(pair(sel(c, 80), sel(c, 0), f), rng); L.append(fmt(f"{c} cant minus no cant, {key}", S[k]))
    for c in ("indi", "geo"):
        for cap in (0, 80):
            k = f"m4 {c}-pid cant<={cap}"; S[k] = stat(pair(sel(c, cap), sel("pid", cap), lambda x, y: x["rms"] - y["rms"]), rng)
            L.append(fmt(f"{c} minus pid, cant<={cap}, RMS", S[k]))
        k = f"m4 H4 {c}"; S[k] = stat(pair(sel(c, 0), sel("pid", 80), lambda x, y: x["rms"] - y["rms"]), rng)
        L.append(fmt(f"H4: {c} no cant minus pid cant, RMS", S[k]))

    L += ["", "Milestone 5 (m5_rotorpy, stored ten seeds): cant minus no cant per law and condition, RMS deg"]
    ds = m5["designs"]
    for c in ("pid", "indi", "geo"):
        for cond in ("stylised", "torque", "aero", "aero_cop", "aero_cop2"):
            a, b = by_seed(ds, ctrl=c, cap=80), by_seed(ds, ctrl=c, cap=0)
            k = f"m5 {c} {cond}"; S[k] = stat(pair(a, b, lambda x, y: x[cond]["rms"] - y[cond]["rms"]), rng); L.append(fmt(f"{c} {cond}", S[k]))
    for cond in ("stylised", "torque", "aero", "aero_cop", "aero_cop2"):
        k = f"m5 H4 {cond}"
        S[k] = stat(pair(by_seed(ds, ctrl="indi", cap=0), by_seed(ds, ctrl="pid", cap=80), lambda x, y: x[cond]["rms"] - y[cond]["rms"]), rng)
        L.append(fmt(f"H4: indi no cant minus pid cant, {cond}", S[k]))
    return L, S


if __name__ == "__main__":
    L, S = main()
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    json.dump({k: v for k, v in S.items()}, open(os.path.join(HERE, "stats.json"), "w"), indent=1)
    print("\n".join(L))
