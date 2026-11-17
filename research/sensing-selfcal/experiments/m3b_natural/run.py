"""Milestone 3b: self-calibrate every disjoint window of three TUM RGB-D sequences from SIFT tracks.

Usage: python3 run.py <tum dir> [n_workers]
<tum dir> holds the extracted sequences (fetch.sh). Writes results.json next to this file.

Windows: 12 keyframes, every 3rd frame (36 frames, about 1.2 s at 30 Hz), consecutive and disjoint,
from the first frame. Each window is solved from three starting focal lengths (F0S) and the
lowest robust cost is kept. The motion in each window (rotation angle and translation between its
first and last keyframe) is read from the sequence's motion-capture ground truth, for description
only; the solver never sees it.
"""
import json, os, sys, time
import numpy as np
import cv2
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nfba  # noqa: E402

SEQS = {"fr1_desk": ("rgbd_dataset_freiburg1_desk", "fr1"),
        "fr1_xyz": ("rgbd_dataset_freiburg1_xyz", "fr1"),
        "fr3_stf": ("rgbd_dataset_freiburg3_structure_texture_far", "fr3")}
NKF, STEP = 12, 3
SIZE = (640, 480)
F0S = (450.0, 554.3, 680.0)     # 554.3 = a generic 60-degree horizontal field of view; +-20% about it


def frames(d):
    out = []
    for line in open(os.path.join(d, "rgb.txt")):
        if line.startswith("#"):
            continue
        t, name = line.split()[:2]
        out.append((float(t), name))
    return out


def groundtruth(d):
    g = np.loadtxt(os.path.join(d, "groundtruth.txt"), comments="#")
    return g    # t tx ty tz qx qy qz qw


def quat_angle_deg(q1, q2):
    d = abs(float(np.dot(q1 / np.linalg.norm(q1), q2 / np.linalg.norm(q2))))
    return float(np.degrees(2 * np.arccos(min(1.0, d))))


def motion(gt, t0, t1):
    i0 = int(np.argmin(abs(gt[:, 0] - t0)))
    i1 = int(np.argmin(abs(gt[:, 0] - t1)))
    return {"rot_deg": quat_angle_deg(gt[i0, 4:8], gt[i1, 4:8]),
            "trans_m": float(np.linalg.norm(gt[i1, 1:4] - gt[i0, 1:4])),
            "gt_dt": float(max(abs(gt[i0, 0] - t0), abs(gt[i1, 0] - t1)))}


def job(args):
    tum, key, w = args
    d = os.path.join(tum, SEQS[key][0])
    fr = frames(d)
    idx = [w * NKF * STEP + i * STEP for i in range(NKF)]
    feats = [nfba.features(cv2.imread(os.path.join(d, fr[i][1]), cv2.IMREAD_GRAYSCALE)) for i in idx]
    t = time.time()
    starts = []
    for f0 in F0S:
        r = nfba.solve_window(feats, SIZE, f0)
        r.pop("data", None)
        r.pop("rv", None)
        r.pop("tv", None)
        r["f0"] = f0
        starts.append(r)
    out = {"seq": key, "unit": SEQS[key][1], "window": w, "frames": [idx[0], idx[-1]],
           "motion": motion(groundtruth(d), fr[idx[0]][0], fr[idx[-1]][0]),
           "starts": starts, "seconds": time.time() - t}
    return out


def main():
    tum = sys.argv[1]
    nw = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    jobs = []
    for key, (name, _) in SEQS.items():
        n = len(frames(os.path.join(tum, name)))
        for w in range(n // (NKF * STEP)):
            jobs.append((tum, key, w))
    print(len(jobs), "windows", flush=True)
    res = []
    with Pool(nw) as p:
        for r in p.imap_unordered(job, jobs):
            res.append(r)
            print(r["seq"], r["window"], round(r["seconds"]), [s["status"] for s in r["starts"]], flush=True)
    res.sort(key=lambda r: (r["seq"], r["window"]))
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump({"nkf": NKF, "step": STEP, "f0s": F0S, "windows": res}, fh, indent=1)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
