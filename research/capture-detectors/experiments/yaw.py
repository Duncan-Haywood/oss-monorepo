"""How does face-detector recall fall as the face turns away from the camera? (`capture-sentinel`'s assumed bearing curve.)

Reference: YuNet detections at score >= 0.3, 24 px or wider, inside a labelled COCO person, on the
full-size photo (a detector's own output, so faces it cannot see at all are absent: this measures the
drop-off between frontal and near-profile, not back-of-head). Face turn is the horizontal offset of
YuNet's nose landmark from the midpoint of its eye landmarks, over the inter-eye distance; it is a
proxy (0 = frontal, grows toward profile), not an angle. Then each detector is asked about the same
faces: YuNet at score 0.6 and 0.9 (the same detections, thresholded), Haar frontal, and Haar profile
(run on the photo and on its mirror). Writes yaw.json and yaw.txt next to this file.
"""
import glob
import json
import os
import sys

import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_detectors import fetch, stats  # noqa: E402
from capture_detectors.detectors import YuNet  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TURN_EDGES = [0.0, 0.15, 0.3, 0.5, 9.0]
MIN_PX = 24
CASC = cv2.data.haarcascades


def cascade(name):
    c = cv2.CascadeClassifier(CASC + name)
    return lambda g: [tuple(map(float, r)) for r in c.detectMultiScale(g, 1.05, 3, minSize=(8, 8))]


def main():
    root = fetch.coco128_dir()
    ynet = cv2.FaceDetectorYN.create(fetch.ensure("yunet.onnx"), "", (320, 320), 0.3, 0.3, 5000)
    front, prof = cascade("haarcascade_frontalface_default.xml"), cascade("haarcascade_profileface.xml")
    names = ("yunet0.6", "yunet0.9", "haar_front", "haar_profile", "haar_any")
    trials = {n: [] for n in names}
    faces = []
    for path in sorted(glob.glob(os.path.join(root, "images", "train2017", "*.jpg"))):
        im = cv2.imread(path)
        h, w = im.shape[:2]
        lbl = path.replace("images", "labels").rsplit(".", 1)[0] + ".txt"
        gt = []
        if os.path.exists(lbl):
            for line in open(lbl):
                c, cx, cy, bw, bh = line.split()
                if c == "0":
                    bw, bh = float(bw) * w, float(bh) * h
                    gt.append((float(cx) * w - bw / 2, float(cy) * h - bh / 2, bw, bh))
        ynet.setInputSize((w, h))
        _, det = ynet.detect(im)
        if det is None:
            continue
        g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
        hf = front(g)
        hp = prof(g) + [(w - x - bw, y, bw, bh) for x, y, bw, bh in prof(cv2.flip(g, 1))]
        for r in det:
            box, score = tuple(float(v) for v in r[:4]), float(r[-1])
            cx, cy = box[0] + box[2] / 2, box[1] + box[3] / 2
            if box[2] < MIN_PX or not any(p[0] <= cx <= p[0] + p[2] and p[1] <= cy <= p[1] + p[3] for p in gt):
                continue
            re, le, nose = r[4:6], r[6:8], r[8:10]
            turn = float(stats.face_turn(re, le, nose))
            hit = {"yunet0.6": score >= 0.6, "yunet0.9": score >= 0.9,
                   "haar_front": any(stats.face_hit(d, box) for d in hf),
                   "haar_profile": any(stats.face_hit(d, box) for d in hp)}
            hit["haar_any"] = hit["haar_front"] or hit["haar_profile"]
            for n in names:
                trials[n].append((turn, int(hit[n])))
            faces.append({"img": os.path.basename(path), "width": box[2], "turn": turn, "score": score})
    json.dump({"faces": faces, "trials": trials, "edges": TURN_EDGES}, open(os.path.join(HERE, "yaw.json"), "w"), indent=1)
    lines = [f"reference faces: {len(faces)} (YuNet >= 0.3, width >= {MIN_PX} px, inside a labelled person)",
             "recall by face-turn proxy |nose offset| / inter-eye distance (0 = frontal), 95% Wilson interval",
             "turn bin      n  " + "  ".join(f"{n:>22}" for n in names)]
    tab = {n: stats.bin_trials(trials[n], TURN_EDGES) for n in names}
    for i, (lo, hi) in enumerate(zip(TURN_EDGES, TURN_EDGES[1:])):
        n_ = tab[names[0]][i][2]
        cells = "  ".join(f"{tab[n][i][4]:5.2f} [{tab[n][i][5]:4.2f},{tab[n][i][6]:4.2f}]".rjust(22) for n in names)
        lines.append(f"{lo:4.2f} to {min(hi, 9):4.2f}  {n_:3d}  {cells}")
    lines.append("pooled: near-frontal (turn < 0.3) against turned (turn >= 0.3)")
    for lo, hi in ((0.0, 0.3), (0.3, 9.0)):
        cells = []
        for n in names:
            sel = [h for t, h in trials[n] if lo <= t < hi]
            a, b = stats.wilson(sum(sel), len(sel))
            cells.append(f"{sum(sel) / len(sel):5.2f} [{a:4.2f},{b:4.2f}]".rjust(22))
        lines.append(f"{lo:4.2f} to {min(hi, 9):4.2f}  {len(sel):3d}  " + "  ".join(cells))
    open(os.path.join(HERE, "yaw.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
