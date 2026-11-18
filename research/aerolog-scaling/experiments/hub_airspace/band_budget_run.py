"""Milestone 11ah driver: altitude bands under a fixed altitude budget (predictions in band_budget.py's docstring).
Needs numpy.

    OMP_NUM_THREADS=1 BUDGET_CACHE=budget.pkl python3 band_budget_run.py > band_budget_results.txt   # ~50 min, 4 cores
BUDGET_CACHE=<file.pkl> caches each layout's inputs (cf_D+ en-route weights, gas_d, transit terms A and B; written
after every layout) so the analysis can be re-run. `--build` stops after the cache is complete."""
import importlib.util
import multiprocessing as mp
import os
import pickle
import statistics as S
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bc = _load("hub_airspace_band_cost_11ah", "band_cost.py")
kw = _load("hub_airspace_split_kway_11ah", "split_kway.py")
ssr = _load("hub_airspace_split_scale_run_11ah", "split_scale_run.py")
rl, st, ff = ssr.rl, ssr.st, ssr.ff
SIZES = ssr.SIZES


def build_layout(job):
    """The inputs 11ag used, computed the same way (cf_D+ as split_scale_run.run_layout, A/B as band_cost_run)."""
    m, idx = job
    cpu = {}
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx, m)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    t = time.process_time()
    ex = st.start_terms(mix, speeds, ssr.LAM, R=ssr.R)
    cfd = ssr._add(ff.flux_terms(mix, speeds, ssr.LAM, R=ssr.R, sym_same=True), ex["start"])
    cpu["cfD+"] = time.process_time() - t
    t = time.process_time()
    T = bc.transit_terms(mix, speeds, rl.LAM)
    cpu["transit"] = time.process_time() - t
    print("M=%d layout %d built, %.0f CPU s" % (m, idx, sum(cpu.values())), file=sys.stderr, flush=True)
    return {"m": m, "idx": idx, "shares": shares, "speeds": speeds, "cfD+": cfd, "T": T, "cpu": cpu}


def build(cache):
    done = pickle.load(open(cache, "rb")) if cache and os.path.exists(cache) else {}
    todo = [(m, i) for m in (16, 12) for i in SIZES[m] if (m, i) not in done]
    if todo:
        with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
            for L in pool_.imap_unordered(build_layout, todo):
                done[(L["m"], L["idx"])] = L
                if cache:
                    pickle.dump(done, open(cache + ".tmp", "wb"))
                    os.replace(cache + ".tmp", cache)
    return done


if __name__ == "__main__":
    cache = os.environ.get("BUDGET_CACHE")
    done = build(cache)
    if "--build" in sys.argv:
        print("built %d layouts" % len(done), file=sys.stderr)
        sys.exit(0)
    import band_budget_analysis  # noqa: E402  (written with the predictions, see band_budget.py)
    band_budget_analysis.main(done)
