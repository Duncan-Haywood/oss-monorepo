"""Milestone 3e: re-solve milestone 3c's windows (as 3c did) and read the optical-axis spread
from the solved poses and from TUM's motion capture, plus corr(f, k1), corr(f, k2).

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
import axis  # noqa: E402
import nfba  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("m3b_run", os.path.join(HERE, "..", "m3b_natural", "run.py"))
m3b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m3b)
M3B = json.load(open(os.path.join(HERE, "..", "m3b_natural", "results.json")))
M3C = {(w["seq"], w["window"]): w for w in
       json.load(open(os.path.join(HERE, "..", "m3c_jackknife", "summary.json")))["windows"]}
SEQ_IDX = {k: i for i, k in enumerate(m3b.SEQS)}


def best_start(w):
    sols = [s for s in w["starts"] if "intr" in s]
    return min(sols, key=lambda s: s["cost"])["f0"] if sols else None


def job(args):
    tum, w = args
    key, wi = w["seq"], w["window"]
    out = {"seq": key, "window": wi}
    c = M3C.get((key, wi))
    if c is None or c["why"] != "ok":
        out["status"] = "not_scored_in_m3c"
        return out
    t = time.time()
    d = os.path.join(tum, m3b.SEQS[key][0])
    fr = m3b.frames(d)
    idx = [wi * m3b.NKF * m3b.STEP + i * m3b.STEP for i in range(m3b.NKF)]
    feats = [nfba.features(cv2.imread(os.path.join(d, fr[i][1]), cv2.IMREAD_GRAYSCALE)) for i in idx]
    cv2.setRNGSeed(1000 * SEQ_IDX[key] + wi)
    r = nfba.solve_window(feats, m3b.SIZE, best_start(w))
    out["status"] = r["status"]
    out["f"] = r["intr"][0]
    out["f_m3c"] = c["f"]
    cov = np.array(r["cov"])
    sd = np.sqrt(np.diag(cov))
    out["corr_f_k1"] = float(cov[0, 3] / (sd[0] * sd[3]))
    out["corr_f_k2"] = float(cov[0, 4] / (sd[0] * sd[4]))
    out["D_solver"] = axis.axis_spread_solver(r["rv"])
    gt = m3b.groundtruth(d)
    qs = [gt[int(np.argmin(abs(gt[:, 0] - fr[i][0]))), 4:8] for i in idx]
    out["D_mocap"] = axis.axis_spread_mocap(qs)
    Rs = [axis.quat_to_R(q) for q in qs]
    out["rot_total_mocap"] = max(axis.total_rotation_deg(Rs[a], Rs[b]) for a in range(12) for b in range(a + 1, 12))
    Rv = [axis.rodrigues(v) for v in r["rv"]]
    out["rot_total_solver"] = max(axis.total_rotation_deg(Rv[a], Rv[b]) for a in range(12) for b in range(a + 1, 12))
    out["seconds"] = time.time() - t
    return out


def main():
    tum = sys.argv[1]
    nw = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    jobs = [(tum, w) for w in M3B["windows"]]
    res = []
    with Pool(nw) as p:
        for r in p.imap_unordered(job, jobs):
            res.append(r)
            print(r["seq"], r["window"], r.get("status"), r.get("f") and round(r["f"], 2),
                  r.get("f_m3c") and round(r["f_m3c"], 2), flush=True)
    res.sort(key=lambda r: (r["seq"], r["window"]))
    json.dump({"windows": res}, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
