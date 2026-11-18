"""Milestone 3j: re-solve the TUM natural-feature windows with the board's intrinsics pinned.

Milestones 3f, 3g and 3i predicted, to first order from each window's covariance, where a 1.2 s
window's focal length would go if its distortion (k1, k2), its principal point (c_x, c_y) or all four
were pinned at the robot's last board calibration; milestone 3h checked that linearisation on board
windows only, because the TUM host refused the proxy. It answers now, so this script runs the
re-solve itself on the TUM windows.

For each of milestone 3c's 57 scored windows: rebuild the window exactly as milestone 3c did
(milestone 3b's pipeline from its lowest-cost start, the same OpenCV RNG seed; the free f must equal
milestone 3c's), then re-solve with milestone 3h's `bundle_pinned` (started at the free solution) with
  k:  (k1, k2)            pinned at the board's Zhang k1 + k2 values (milestone 4n, via 3i's board_ref),
  c:  (c_x, c_y)          pinned at the board's principal point,
  ck: (c_x, c_y, k1, k2)  pinned at all four,
and the first-order prediction of each from the fresh covariance (milestone 3g's formula).

    OMP_NUM_THREADS=1 python3 run.py <tum dir> [n_workers]   # tum dir: ../m3b_natural/fetch.sh
Writes results.json. H161-H166 were written in ../../LOG.md before this script first ran.
"""
import importlib.util, json, os, sys, time
from multiprocessing import Pool
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(EXP, "m3h_linear"))
sys.path.insert(0, os.path.join(EXP, "m3b_natural"))
import nfba  # noqa: E402
from pinned import bundle_pinned, intr_cov_pinned, condition  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


m3b = _load("m3b_run", os.path.join(EXP, "m3b_natural", "run.py"))
m3c = _load("m3c_run", os.path.join(EXP, "m3c_jackknife", "run.py"))
SEQ_IDX = {k: i for i, k in enumerate(m3b.SEQS)}
PINS = {"k": (3, 4), "c": (1, 2), "ck": (1, 2, 3, 4)}


def board_refs():
    tum = _load("m3i_tum", os.path.join(EXP, "m3i_principal", "tum.py"))
    m3i = json.load(open(os.path.join(EXP, "m3i_principal", "tum_summary.json")))["board_reference"]
    out = {}
    for u in ("fr1", "fr3"):
        r = tum.board_ref(u)
        assert all(abs(r[k] - m3i[u][k]) < 1e-6 * max(1.0, abs(m3i[u][k])) for k in ("f", "cx", "cy", "k1", "k2")), u
        out[u] = r
    return out


def job(args):
    tum, w, refs = args
    key, wi = w["seq"], w["window"]
    f0, f_m3b = m3c.best_start(w)
    t = time.time()
    d = os.path.join(tum, m3b.SEQS[key][0])
    fr = m3b.frames(d)
    idx = [wi * m3b.NKF * m3b.STEP + i * m3b.STEP for i in range(m3b.NKF)]
    feats = [nfba.features(cv2.imread(os.path.join(d, fr[i][1]), cv2.IMREAD_GRAYSCALE)) for i in idx]
    cv2.setRNGSeed(1000 * SEQ_IDX[key] + wi)      # milestone 3c's seed
    r = nfba.solve_window(feats, m3b.SIZE, f0)
    out = {"seq": key, "unit": w["unit"], "window": wi, "f0": f0, "f_m3b": f_m3b}
    if "data" not in r:
        out["why"] = r["status"]
        return out
    vi, pi, uv, X = r["data"]
    rv, tv = np.array(r["rv"]), np.array(r["tv"])
    prob = nfba.Problem(vi, pi, uv, len(rv), len(X), tv)
    info, (intr, rv, tv, X), q = nfba.bundle(prob, np.array(r["intr"]), rv, tv, X)   # as milestone 3c's refit
    cov, sig, _, _ = nfba.intr_cov(prob, q)
    R = refs[w["unit"]]
    refv = np.array([R["f"], R["cx"], R["cy"], R["k1"], R["k2"]])
    out.update(why="ok", f_solve=r["intr"][0], intr=intr.tolist(), cov=cov.tolist(), sigma=sig,
               cost=info["cost"], status=info["status"], n_obs=int(len(vi)), n_tracks=int(len(X)))
    for name, pins in PINS.items():
        target = refv[list(pins)]
        fc, ratio = condition(intr, cov, pins, target)
        i0 = intr.copy()
        i0[list(pins)] = target
        pinfo, (ip, *_), qp = bundle_pinned(prob, i0, rv, tv, X, pinned=pins)
        cp, _, sigp = intr_cov_pinned(prob, qp, pinned=pins)
        out[name] = {"fc": fc, "sd_ratio_c": ratio, "fp": float(ip[0]), "intr_p": ip.tolist(),
                     "sd_p": float(np.sqrt(cp[0, 0])), "sd_free": float(np.sqrt(cov[0, 0])), "sigma_p": sigp,
                     "cost_p": pinfo["cost"], "status_p": pinfo["status"], "iters_p": pinfo["iters"],
                     "kept": bool(np.allclose(ip[list(pins)], target, atol=1e-12))}
    out["seconds"] = time.time() - t
    return out


def main():
    tum = sys.argv[1]
    nw = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    scored = {(w["seq"], w["window"]) for w in
              json.load(open(os.path.join(EXP, "m3c_jackknife", "summary.json")))["windows"] if w["why"] == "ok"}
    refs = board_refs()
    jobs = [(tum, w, refs) for w in json.load(open(os.path.join(EXP, "m3b_natural", "results.json")))["windows"]
            if (w["seq"], w["window"]) in scored]
    print(len(jobs), "windows", flush=True)
    res = []
    with Pool(nw) as p:
        for r in p.imap_unordered(job, jobs):
            res.append(r)
            print(r["seq"], r["window"], r.get("why"), round(r.get("seconds", 0)),
                  {k: round(r[k]["fp"], 1) for k in PINS if k in r}, flush=True)
    res.sort(key=lambda r: (r["seq"], r["window"]))
    json.dump({"board_reference": refs, "pins": PINS, "windows": res},
              open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
