"""Measure face and person detector recall against pixel size on COCO photos.

Faces: COCO has no face boxes, so the reference is YuNet's own confident (>= 0.9) detections at
full resolution, 24 px or wider and inside a labelled person. Each photo is then shrunk by a
range of scales and each detector is asked to find those same faces again. Recall is therefore
"found again at this size, given findable at full size", not recall against a human face label.
People: COCO's hand-drawn person boxes, shrunk by the same scales; a hit is IoU >= 0.5.
Writes results.txt and results.json next to this file. ~5 to 10 minutes on a CPU.
"""
import glob
import json
import os
import sys
import time

import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_detectors import fetch, stats  # noqa: E402
from capture_detectors.detectors import Haar, Hog, YoloxPerson, YuNet  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SCALES = [1.0, 0.75, 0.5, 0.35, 0.25, 0.18, 0.125, 0.09, 0.065]
FACE_EDGES = [6, 8, 12, 16, 24, 32, 48, 64, 128, 1e9]
BODY_EDGES = [12, 20, 32, 48, 64, 96, 128, 192, 300, 1e9]
REF_MIN_PX = 24
UPRIGHT = 1.8  # person box height/width to count as an upright body


def load_people(lbl, w, h):
    out = []
    if os.path.exists(lbl):
        for line in open(lbl):
            c, cx, cy, bw, bh = line.split()
            if c == "0":
                bw, bh = float(bw) * w, float(bh) * h
                out.append((float(cx) * w - bw / 2, float(cy) * h - bh / 2, bw, bh))
    return out


def inside(face, box):
    cx, cy = face[0] + face[2] / 2, face[1] + face[3] / 2
    return box[0] <= cx <= box[0] + box[2] and box[1] <= cy <= box[1] + box[3]


def main():
    root = fetch.coco128_dir()
    imgs = sorted(glob.glob(os.path.join(root, "images", "train2017", "*.jpg")))
    yunet = {t: YuNet(t) for t in (0.3, 0.6, 0.9)}
    haar, yolox, hog = Haar(), YoloxPerson(), Hog()
    t0 = time.time()

    faces = []   # reference faces: dict(img, box, person)
    people = []  # GT persons: dict(img, box)
    cache = {}
    for path in imgs:
        im = cv2.imread(path)
        h, w = im.shape[:2]
        gt = load_people(path.replace("images", "labels").rsplit(".", 1)[0] + ".txt", w, h)
        cache[path] = (im, gt)
        for p in gt:
            people.append({"img": path, "box": p})
        for f in yunet[0.9](im):
            if f[2] >= REF_MIN_PX:
                owner = [p for p in gt if inside(f, p)]
                if owner:
                    faces.append({"img": path, "box": f[:4], "person": min(owner, key=lambda p: p[2] * p[3])})
    print(f"{len(imgs)} photos, {len(people)} persons, {len(faces)} reference faces", flush=True)

    # ---- faces: recall against face width after shrinking
    face_trials = {k: [] for k in ("yunet0.3", "yunet0.6", "yunet0.9", "haar")}
    face_groups = {k: {} for k in face_trials}
    joint = []  # (face px, face hit yunet0.6, body hit yolox) for the independence check
    by_img = {}
    for i, f in enumerate(faces):
        by_img.setdefault(f["img"], []).append(i)
    for path, ids in by_img.items():
        im, gt = cache[path]
        for s in SCALES:
            sm = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s != 1.0 else im
            if min(sm.shape[:2]) < 16:
                continue
            det = {"yunet0.3": yunet[0.3](sm), "yunet0.6": yunet[0.6](sm), "yunet0.9": yunet[0.9](sm), "haar": haar(sm)}
            bodies = yolox(sm)
            for i in ids:
                f = faces[i]
                ref = tuple(v * s for v in f["box"])
                px = ref[2]
                hits = {}
                for name, d in det.items():
                    hit = int(any(stats.face_hit(x, ref) for x in d))
                    hits[name] = hit
                    face_trials[name].append((px, hit))
                    face_groups[name].setdefault(i, []).append((px, hit))
                pb = tuple(v * s for v in f["person"])
                if pb[3] / pb[2] >= UPRIGHT:
                    joint.append((px, hits["yunet0.6"], int(any(stats.iou(b, pb) >= 0.5 for b in bodies))))
        print(f"  faces {path[-16:]} {time.time() - t0:.0f}s", flush=True)

    # ---- persons: recall against box height after shrinking
    body_trials = {"yolox": [], "hog": []}
    body_groups = {"yolox": {}, "hog": {}}
    all_trials = {"yolox": []}
    by_img = {}
    for i, p in enumerate(people):
        by_img.setdefault(p["img"], []).append(i)
    for path, ids in by_img.items():
        im, _ = cache[path]
        print('  start', path[-16:], im.shape, flush=True)
        for s in SCALES:
            sm = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s != 1.0 else im
            if min(sm.shape[:2]) < 16:
                continue
            det = {"yolox": yolox(sm), "hog": hog(sm)}
            for i in ids:
                pb = tuple(v * s for v in people[i]["box"])
                if pb[3] < 12:
                    continue
                for name, d in det.items():
                    hit = int(any(stats.iou(b, pb) >= 0.5 for b in d))
                    if name == "yolox":
                        all_trials["yolox"].append((pb[3], hit))
                    if pb[3] / pb[2] >= UPRIGHT:
                        body_trials[name].append((pb[3], hit))
                        body_groups[name].setdefault(i, []).append((pb[3], hit))
        print(f"  people {path[-16:]} {time.time() - t0:.0f}s", flush=True)

    # ---- where does the head sit in a detected body box? (YOLOX at full size vs the reference face)
    cover = {q: [] for q in (0.12, 0.15, 0.2, 0.25, 0.33)}
    n_boxes = 0
    for path, ids in by_img.items():
        im, _ = cache[path]
        bodies = yolox(im)
        for f in [x for x in faces if x["img"] == path]:
            pb = f["person"]
            if pb[3] / pb[2] < UPRIGHT:
                continue
            match = [b for b in bodies if stats.iou(b, pb) >= 0.5]
            if not match:
                continue
            b = max(match, key=lambda b: stats.iou(b, pb))
            n_boxes += 1
            for q in cover:
                cover[q].append(stats.head_coverage(f["box"], b, q))

    out = {"photos": len(imgs), "persons": len(people), "ref_faces": len(faces),
           "ref_face_px": sorted(round(f["box"][2]) for f in faces), "scales": SCALES}
    out["face"] = {}
    for name in face_trials:
        rows = stats.bin_trials(face_trials[name], FACE_EDGES)
        mid, k = stats.fit_recall([t for t in face_trials[name] if t[0] >= 6])
        mr, kr = stats.bootstrap_fit([[t for t in g if t[0] >= 6] for g in face_groups[name].values()])
        out["face"][name] = {"bins": rows, "mid": mid, "k": k, "mid_ci": mr, "k_ci": kr, "n": len(face_trials[name])}
    out["body"] = {}
    for name in body_trials:
        rows = stats.bin_trials(body_trials[name], BODY_EDGES)
        mid, k = stats.fit_recall(body_trials[name])
        mr, kr = stats.bootstrap_fit(list(body_groups[name].values()))
        out["body"][name] = {"bins": rows, "mid": mid, "k": k, "mid_ci": mr, "k_ci": kr, "n": len(body_trials[name])}
    out["body"]["yolox_all_boxes"] = {"bins": stats.bin_trials(all_trials["yolox"], BODY_EDGES), "n": len(all_trials["yolox"])}
    out["joint"] = joint
    out["face_to_body"] = sorted(round(f["box"][2] / f["person"][3], 4) for f in faces if f["person"][3] / f["person"][2] >= UPRIGHT)
    out["head_cover"] = {str(q): {"n": len(v), "full": sum(c >= 0.9 for c in v) / max(1, len(v)),
                                  "any": sum(c > 0 for c in v) / max(1, len(v))} for q, v in cover.items()}
    out["head_cover_n"] = n_boxes
    out["seconds"] = round(time.time() - t0)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("done", out["seconds"], "s")


if __name__ == "__main__":
    main()
