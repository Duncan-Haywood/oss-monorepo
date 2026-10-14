"""Do DE restarts remove the missed gauge-2 sub-search? Rules (laser cutting) and free steel sheet, seeds 0-19.

Gauge b=2 mm, peak von Mises on the search mesh h=2.5 mm. Three search variants:
  base     one DE run, popsize 4, 17 iterations (what `optimise` does per gauge);
  restart2 two independent runs of `base` (seeds s and s+1000) keeping the lighter feasible one;
  bigpop   one DE run with popsize 8, 17 iterations (about the same finite-element solves as restart2).
Writes restarts.json and restarts.txt.
"""
import json, os, statistics as st, sys
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_gaugerestart import PROCESSES, FREE, evaluate
from simdesign_gaugerestart.optimise import _search

OUT = os.path.dirname(os.path.abspath(__file__))
H, B, MAXITER = 2.5, 2, 17
KINDS = {"rules": PROCESSES["laser cutting"], "free": FREE["steel sheet"]}
SEEDS = range(20)


def one(kind, seed, popsize):
    proc = KINDS[kind]
    p, n = _search(proc, B, seed, popsize, MAXITER, H, "peak")
    e = evaluate(proc, p, h=H, measure="peak")
    return (e["mass_g"] if e["feasible"] else None), n


def task(t):
    kind, variant, seed = t
    if variant == "base":
        m, n = one(kind, seed, 4)
    elif variant == "bigpop":
        m, n = one(kind, seed, 8)
    else:
        (m1, n1), (m2, n2) = one(kind, seed, 4), one(kind, seed + 1000, 4)
        ms = [m for m in (m1, m2) if m is not None]
        m, n = (min(ms) if ms else None), n1 + n2
    return {"kind": kind, "variant": variant, "seed": seed, "mass_g": m, "n_fe": n}


def summarise(res):
    L = [f"gauge b={B} mm, peak measure, h={H} mm, seeds 0-19; mass in g, n_fe = finite-element solves"]
    for v in ("base", "restart2", "bigpop"):
        for k in KINDS:
            r = [x for x in res if x["kind"] == k and x["variant"] == v]
            ok = sorted(x["mass_g"] for x in r if x["mass_g"] is not None)
            lo = sum(1 for m in ok if m < 34.65)
            L.append(f"{v:9s} {k:5s}: missed {len(r)-len(ok)} of {len(r)}; mean n_fe {st.mean(x['n_fe'] for x in r):.0f}; "
                     f"lower group (<34.65 g) {lo}, upper {len(ok)-lo}; masses " + " ".join(f"{m:.2f}" for m in ok))
    L.append("price at gauge 2 (rules/free, same seed), seeds where both feasible")
    for v in ("base", "restart2", "bigpop"):
        d = {(x["kind"], x["seed"]): x["mass_g"] for x in res if x["variant"] == v}
        pr = [d[("rules", s)] / d[("free", s)] for s in SEEDS if d[("rules", s)] and d[("free", s)]]
        L.append(f"{v:9s}: n={len(pr)} mean {st.mean(pr):.3f} sd {st.stdev(pr):.3f} range {min(pr):.3f}-{max(pr):.3f}")
    return L


def main():
    tasks = [(k, v, s) for v in ("base", "restart2", "bigpop") for k in KINDS for s in SEEDS]
    with Pool(4) as pool:
        res = pool.map(task, tasks, chunksize=1)
    json.dump(res, open(os.path.join(OUT, "restarts.json"), "w"), indent=1)
    L = summarise(res)
    open(os.path.join(OUT, "restarts.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
