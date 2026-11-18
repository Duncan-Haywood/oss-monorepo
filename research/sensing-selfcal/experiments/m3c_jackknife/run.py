"""Milestone 3c: re-solve each of milestone 3b's windows from its best start, then the
delete-one-keyframe jackknife, track- and keyframe-clustered sandwiches and the lag-1 residual
correlation along tracks.

Usage: OMP_NUM_THREADS=1 python3 run.py <tum dir> [n_workers]   (tum dir: ../m3b_natural/fetch.sh)
Writes results.json next to this file.
"""
import json, os, sys, time
import numpy as np
import cv2
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "m3b_natural"))
import jk  # noqa: E402
import nfba  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("m3b_run", os.path.join(HERE, "..", "m3b_natural", "run.py"))
m3b = importlib.util.module_from_spec(_spec)   # milestone 3b's run.py: sequences, window layout
_spec.loader.exec_module(m3b)

M3B = json.load(open(os.path.join(HERE, "..", "m3b_natural", "results.json")))
SEQ_IDX = {k: i for i, k in enumerate(m3b.SEQS)}


def best_start(w):
    sols = [s for s in w["starts"] if "intr" in s]
    if not sols:
        return None, None
    b = min(sols, key=lambda s: s["cost"])
    return b["f0"], b["intr"][0]


def job(args):
    tum, w = args
    key, wi = w["seq"], w["window"]
    f0, f_m3b = best_start(w)
    out = {"seq": key, "unit": w["unit"], "window": wi, "rot_deg": w["motion"]["rot_deg"],
           "trans_m": w["motion"]["trans_m"], "f0": f0, "f_m3b": f_m3b}
    if f0 is None:
        out["status"] = "no_m3b_solution"
        return out
    t = time.time()
    d = os.path.join(tum, m3b.SEQS[key][0])
    fr = m3b.frames(d)
    idx = [wi * m3b.NKF * m3b.STEP + i * m3b.STEP for i in range(m3b.NKF)]
    feats = [nfba.features(cv2.imread(os.path.join(d, fr[i][1]), cv2.IMREAD_GRAYSCALE)) for i in idx]
    cv2.setRNGSeed(1000 * SEQ_IDX[key] + wi)
    r = nfba.solve_window(feats, m3b.SIZE, f0)
    for k in ("status", "n_tracks", "n_obs", "intr", "sd", "sigma", "rms_inlier", "inlier_frac", "iters", "cost"):
        if k in r:
            out[k] = r[k]
    if "data" not in r:
        return out
    f = r["intr"][0]
    if not (r["status"] == "ok" and r["n_tracks"] >= 100 and r["rms_inlier"] < 1.5 and 300 < f < 1000):
        out["skipped"] = "fails milestone 3b's counting rules; not scored, so no jackknife"
        out["seconds"] = time.time() - t
        return out
    vi, pi, uv, _ = r["data"]
    intr = np.array(r["intr"])
    rv, tv = np.array(r["rv"]), np.array(r["tv"])
    # rebuild the solved problem (same gauge as solve_window) to get X and q at the solution
    X = r["data"][3]
    prob = nfba.Problem(vi, pi, uv, len(rv), len(X), tv)
    info, (intr_s, rv_s, tv_s, X_s), q = nfba.bundle(prob, intr, rv, tv, X)
    out["refit_df"] = float(intr_s[0] - intr[0])
    try:
        out["sd_track"] = float(np.sqrt(jk.sandwich(prob, q, pi)[0, 0]))
        out["sd_view"] = float(np.sqrt(jk.sandwich(prob, q, vi)[0, 0]))
    except np.linalg.LinAlgError:
        out["sd_track"] = out["sd_view"] = None
    out["lag1"] = jk.lag1_corr(prob, q)
    out["jk"] = jk.jackknife(vi, pi, uv, intr_s, rv_s, tv_s, X_s)
    out["seconds"] = time.time() - t
    return out


def main():
    tum = sys.argv[1]
    nw = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    only = sys.argv[3] if len(sys.argv) > 3 else None
    part = os.path.join(HERE, "partial.jsonl")      # one line per finished window, so a stopped run resumes
    res = []
    if only is None and os.path.exists(part):
        res = [json.loads(line) for line in open(part)]
    done = {(r["seq"], r["window"]) for r in res}
    jobs = [(tum, w) for w in M3B["windows"] if (only is None or f'{w["seq"]}:{w["window"]}' == only)
            and (w["seq"], w["window"]) not in done]
    print(len(jobs), "windows to run,", len(done), "already done", flush=True)
    with Pool(nw) as p:
        for r in p.imap_unordered(job, jobs):
            res.append(r)
            if only is None:
                with open(part, "a") as fh:
                    fh.write(json.dumps(r) + "\n")
            print(r["seq"], r["window"], round(r.get("seconds", 0)), r.get("status"),
                  round(r["intr"][0], 1) if "intr" in r else None, r.get("f_m3b") and round(r["f_m3b"], 1), flush=True)
    res.sort(key=lambda r: (r["seq"], r["window"]))
    name = "results.json" if only is None else "pilot.json"
    with open(os.path.join(HERE, name), "w") as fh:
        json.dump({"windows": res}, fh, indent=1)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
