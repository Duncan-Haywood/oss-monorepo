"""Milestone 4p, step 1: pick a second, disjoint set of 13 views from each TUM RGB-D sequence.

    python3 experiments/m4p_fresh/prepare.py fr1 <dir>/rgbd_dataset_freiburg1_rgb_calibration
    python3 experiments/m4p_fresh/prepare.py fr3 <dir>/rgbd_dataset_freiburg3_calibration_rgb_depth

The sequences are fetched by experiments/m4j_tum/fetch.sh (TUM RGB-D benchmark, Sturm et al., IROS
2012; CC BY 4.0). Milestone 4j's selection (its prepare.py: detection with the 5x5 cornerSubPix window,
orientation, the 15 px spacing floor, 13 equal time blocks, and in each block the most foreshortened
frame among those at least as sharp as the block's median) is imported unchanged. The only change,
fixed in LOG.md (milestone 4p planned) before any solve: in each block the frame 4j kept, and every
frame within GAP seconds of it, are removed before the pick. The script first checks that it
reproduces 4j's 13 frames exactly, then writes corners_<unit>b.json in 4j's format.
"""
import glob, importlib.util, json, os, sys
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
M4J = os.path.join(ROOT, "experiments", "m4j_tum")
_spec = importlib.util.spec_from_file_location("m4j_prepare", os.path.join(M4J, "prepare.py"))
p4j = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(p4j)

GAP = 1.0   # seconds either side of 4j's kept frame


def detect_all(seq):
    frames = sorted(glob.glob(os.path.join(seq, "rgb", "*.png")))
    found, size = [], None
    for f in frames:
        img = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
        c, size = p4j.detect(img, pattern=p4j.PATTERN, method="subpix5")
        if c is None:
            continue
        c = p4j.orient(c)
        if p4j.spacing(c) < p4j.MIN_SPACING:
            continue
        found.append(dict(name=os.path.basename(f), t=float(os.path.basename(f)[:-4]), sharp=p4j.sharpness(img, c),
                          tilt=p4j.tilt(c), spacing=p4j.spacing(c), corners=c.tolist()))
    return frames, found, size


def pick(block, exclude_t=None):
    if exclude_t is not None:
        block = [r for r in block if abs(r["t"] - exclude_t) > GAP]
    med = np.median([r["sharp"] for r in block])
    return max((r for r in block if r["sharp"] >= med), key=lambda r: r["tilt"])


def main(unit, seq):
    with open(os.path.join(M4J, f"corners_{unit}.json")) as fh:
        a = json.load(fh)
    frames, found, size = detect_all(seq)
    assert len(found) == a["n_detected"], (len(found), a["n_detected"])
    blocks = [[found[i] for i in b] for b in np.array_split(np.arange(len(found)), p4j.NV)]
    first = [pick(b) for b in blocks]
    assert [r["name"] for r in first] == [v["name"] for v in a["views"]], "4j's selection not reproduced"
    fresh = [pick(b, r["t"]) for b, r in zip(blocks, first)]
    gaps = [abs(f["t"] - r["t"]) for f, r in zip(fresh, first)]
    out = dict(unit=unit + "b", source=a["source"], pattern=list(p4j.PATTERN), size=list(size),
               n_frames=len(frames), n_detected=len(found), gap_s=GAP, views=fresh,
               gap_to_4j_s=gaps, block_sizes=[len(b) for b in blocks])
    with open(os.path.join(HERE, f"corners_{unit}b.json"), "w") as fh:
        json.dump(out, fh)
    print(unit + "b", len(found), "detected; 4j's 13 reproduced; fresh views:", [r["name"] for r in fresh])
    print("  seconds from 4j's frame:", [round(g, 2) for g in gaps])
    print("  spacing", [round(r["spacing"], 1) for r in fresh], "tilt", [round(r["tilt"], 3) for r in fresh])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
