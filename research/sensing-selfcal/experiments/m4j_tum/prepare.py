"""Milestone 4j, step 1: pick 13 views of each TUM RGB-D calibration sequence and store their corners.

    python3 experiments/m4j_tum/prepare.py fr1 <dir>/rgbd_dataset_freiburg1_rgb_calibration
    python3 experiments/m4j_tum/prepare.py fr3 <dir>/rgbd_dataset_freiburg3_calibration_rgb_depth

The sequences are from the TUM RGB-D benchmark (Sturm et al., IROS 2012; CC BY 4.0), fetched with
fetch.sh. Only the detected corners and the frame names are stored here (corners_<unit>.json), not
the images: a person holds the board in every frame.

The selection rule was fixed before any solve on these frames (LOG.md, milestone 4j planned):
1. every frame where cv2.findChessboardCorners finds the full 8x6 board, then cornerSubPix with the
   5x5 window milestone 6b found unbiased (selfcal.detect, method "subpix5");
2. the 180-degree ambiguity of an even-by-even board is resolved by turning each detection so that
   the step from corner 0 to corner 7 (along the first row) points to the right of the image
   (dot product with +x positive); a board turned more than 90 degrees in plane would be mislabelled,
   which the 13-view solve's rms would show;
3. detections whose mean spacing between neighbouring corners is under 15 px are dropped (the 5x5
   window is 11 px wide; on OpenCV's board, milestones 1-6, corners were 25-41 px apart);
4. the remaining frames, in time order, are cut into 13 blocks of equal count; in each block, among the
   frames at least as sharp as the block's median (variance of the Laplacian inside the board's
   bounding box; the Kinect blurs when the board moves), the one with the most foreshortening is
   kept: |log(left edge / right edge)| + |log(top edge / bottom edge)| of the detected grid, a
   tilt measure that needs no camera model.

Rule 4 replaced a first version (the sharpest frame per block, no spacing floor) after it was run
once and, before any solve, picked boards 7-8 px between corners and 11 of 13 views nearly
fronto-parallel to the camera, the configuration in which f is least identifiable (Sturm and
Maybank 1999). Only corner spacing and a contact sheet were looked at, no focal length.
"""
import glob, json, os, sys
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import detect  # noqa: E402

PATTERN = (8, 6)   # inner corners of the TUM calibration board (found by trying; 9x7 squares)
NV = 13


def orient(c):
    row = c[PATTERN[0] - 1] - c[0]
    return c if row[0] > 0 else c[::-1].copy()


def sharpness(img, c):
    x0, y0 = np.floor(c.min(0)).astype(int)
    x1, y1 = np.ceil(c.max(0)).astype(int)
    crop = img[max(y0, 0):y1 + 1, max(x0, 0):x1 + 1]
    return float(cv2.Laplacian(crop, cv2.CV_64F).var())


MIN_SPACING = 15.0


def spacing(c):
    g = c.reshape(PATTERN[1], PATTERN[0], 2)
    return float(np.mean(np.r_[np.linalg.norm(np.diff(g, axis=1), axis=2).ravel(),
                               np.linalg.norm(np.diff(g, axis=0), axis=2).ravel()]))


def tilt(c):
    g = c.reshape(PATTERN[1], PATTERN[0], 2)
    top, bottom = np.linalg.norm(g[0, -1] - g[0, 0]), np.linalg.norm(g[-1, -1] - g[-1, 0])
    left, right = np.linalg.norm(g[-1, 0] - g[0, 0]), np.linalg.norm(g[-1, -1] - g[0, -1])
    return float(abs(np.log(left / right)) + abs(np.log(top / bottom)))


def main(unit, seq):
    frames = sorted(glob.glob(os.path.join(seq, "rgb", "*.png")))
    found = []
    for f in frames:
        img = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
        c, size = detect(img, pattern=PATTERN, method="subpix5")
        if c is None:
            continue
        c = orient(c)
        t = float(os.path.basename(f)[:-4])
        if spacing(c) < MIN_SPACING:
            continue
        found.append(dict(name=os.path.basename(f), t=t, sharp=sharpness(img, c), tilt=tilt(c),
                          spacing=spacing(c), corners=c.tolist()))
    pick = []
    for block in np.array_split(np.arange(len(found)), NV):
        block = [found[i] for i in block]
        if block:
            med = np.median([r["sharp"] for r in block])
            pick.append(max((r for r in block if r["sharp"] >= med), key=lambda r: r["tilt"]))
    out = dict(unit=unit, source=os.path.basename(os.path.normpath(seq)), pattern=list(PATTERN), size=list(size),
               n_frames=len(frames), n_detected=len(found), views=pick)
    with open(os.path.join(HERE, f"corners_{unit}.json"), "w") as fh:
        json.dump(out, fh)
    print(unit, len(frames), "frames,", len(found), "with the full board at >= 15 px spacing,", len(pick), "views kept:",
          [r["name"] for r in pick])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
