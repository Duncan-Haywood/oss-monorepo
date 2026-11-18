"""Milestone 11, step 1: fetch the Adel et al. (2024) scan and extract the members' face profiles.

    python experiments/m11_measured/extract.py            # writes profiles.json beside this file

Downloads the data set's Database.zip (54 MB, CC BY 4.0, doi:10.34770/0w80-p436; Princeton Data
Commons, served by Globus) into _data/ (gitignored), checks its SHA-256, and writes the extracted
profiles (a few hundred kB) to profiles.json, which run.py reads; the raw scan is not committed.
About a minute on one CPU, most of it parsing the 1.8 M-point ASCII PLY.

Data: Ruan, D. (2024). Adaptive Multi-Robot Timber Construction Dataset. Princeton University.
doi:10.34770/0w80-p436. CC BY 4.0. Paper: Adel, A., Ruan, D., McGee, W., Mozaffari, S. (2024).
Feedback-driven adaptive multi-robot timber construction. Automation in Construction 164, 105444.
"""
import hashlib
import json
import os
import sys
import urllib.request
import zipfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import measured as M  # noqa: E402

URL = "https://g-ef94ef.f0ad1.36fe.data.globus.org/10.34770/0w80-p436/291/Database.zip"
SHA256 = "a870b72d00f27334b72c7b4c18178e30781a01ab1c470a08c04c6d12403349bf"
DATA = os.path.join(HERE, "_data")
WALL = "Database/02_Experiment2/01_PointCloudScans/01_FilteredScans/WallModuleScan.ply"
POSE = ["Database/01_Experiment1/01_PoseDeviations/BenchmarkPose.csv",
        "Database/01_Experiment1/01_PoseDeviations/AdaptivePose.csv"]


def fetch():
    os.makedirs(DATA, exist_ok=True)
    z = os.path.join(DATA, "Database.zip")
    if not os.path.exists(z):
        print("downloading", URL, file=sys.stderr)
        urllib.request.urlretrieve(URL, z)
    h = hashlib.sha256(open(z, "rb").read()).hexdigest()
    if h != SHA256:
        raise SystemExit(f"Database.zip SHA-256 {h} != {SHA256}")
    with zipfile.ZipFile(z) as f:
        for name in [WALL] + POSE:
            if not os.path.exists(os.path.join(DATA, name)):
                f.extract(name, DATA)


def vertical_centres(Q, lo, hi, v0=1250.0):
    """Members crossing mid-height (face strips at least 30 mm wide), as u centres."""
    u, v, w = Q.T
    m = (np.abs(v - v0) < 50)
    h, e = np.histogram(u[m], bins=np.arange(u[m].min() - 5, u[m].max() + 5, 2.0))
    occ = h > 20
    runs, i = [], 0
    while i < len(occ):
        if occ[i]:
            j = i
            while j < len(occ) and occ[j]:
                j += 1
            if e[j] - e[i] >= 30:
                runs.append(float((e[i] + e[j]) / 2))
            i = j
        else:
            i += 1
    return runs


def track(Q, c0, v0, v1, exclude, half=150.0):
    """Median u of the face points near height v1 within ``half`` of c0, away from ``exclude``."""
    u, v, w = Q.T
    m = (np.abs(v - v1) < 40) & (np.abs(u - c0) < half)
    for x in exclude:
        m &= np.abs(u - x) > 35
    return float(np.median(u[m]))


def main():
    fetch()
    P = M.read_ply(os.path.join(DATA, WALL))
    coef, sd = M.fit_plane(P)
    Q = M.wall_frame(P, coef)
    lo, hi = M.plate_bounds(Q)
    cents = vertical_centres(Q, lo, hi)
    # vertical studs: the same centre at 0.3 and 0.9 of the height; the rest are inclined
    vert, incl = [], []
    for c in cents:
        a = track(Q, c, 1250, lo + 0.15 * (hi - lo), [], half=25)
        b = track(Q, c, 1250, lo + 0.85 * (hi - lo), [], half=25)
        (vert if abs(a - b) < 10 else incl).append(c)
    out = {"source": {"doi": "10.34770/0w80-p436", "license": "CC BY 4.0", "file": WALL, "sha256_zip": SHA256,
                      "points": int(len(P))},
           "plane": {"coef": [float(x) for x in coef], "inlier_sd_mm": sd},
           "plates_mm": [lo, hi], "members": []}
    for c in vert:
        pr = M.member_profile(Q, c, c, lo + 5, hi - 5, front=-40)
        wide = M.member_profile(Q, c, c, lo + 5, hi - 5, front=-40, flat=50.0)
        out["members"].append({"kind": "vertical", "u_mid": c, "u_bot": c, "u_top": c,
                               **{k: np.round(v, 4).tolist() for k, v in pr.items()},
                               "width_all": np.round(np.interp(pr["v"], wide["v"], wide["width"]), 3).tolist()})
    for c in incl:
        vb, vt = lo + 0.1 * (hi - lo), lo + 0.9 * (hi - lo)
        ub = track(Q, c, 1250, vb, vert)
        ut = track(Q, c, 1250, vt, vert)
        k = (ut - ub) / (vt - vb)
        u_bot, u_top = ub + k * (lo + 5 - vb), ub + k * (hi - 5 - vb)
        pr = M.member_profile(Q, u_bot, u_top, lo + 5, hi - 5, front=-40, half=25)
        out["members"].append({"kind": "inclined", "u_mid": c, "u_bot": u_bot, "u_top": u_top,
                               **{kk: np.round(v, 4).tolist() for kk, v in pr.items()}})
    # The plates are not extracted: their inner edge meets the studs' ends in the same plane, so
    # a slice cannot tell plate from stud there, and a window clipped to the plate biases the
    # centre. Milestone 11 needs the studs.
    out["pose"] = {}
    for name in POSE:
        rows = np.loadtxt(os.path.join(DATA, name), delimiter=",", skiprows=1)
        out["pose"][os.path.basename(name)[:-4]] = rows.round(6).tolist()
    json.dump(out, open(os.path.join(HERE, "profiles.json"), "w"), separators=(",", ":"))
    print(f"plane sd {sd:.2f} mm; plates {lo:.1f}..{hi:.1f} mm; vertical {len(vert)}, inclined {len(incl)}")


if __name__ == "__main__":
    main()
