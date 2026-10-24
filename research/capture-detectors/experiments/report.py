"""results.json -> results.txt (tables quoted in the README). Stdlib only."""
import json
import os
import statistics
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_detectors import stats  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
F_8K = 183.3  # face width 0.15 m x 1222 px/rad (8K equirect), capture-bystander's figure


def rng(lo, hi):
    return f"{lo:g}-{'' if hi > 1e8 else format(hi, 'g')}" if hi < 1e8 else f"{lo:g}+"


def pct(r):
    return f"{r[4]:.2f} ({r[5]:.2f}-{r[6]:.2f}), n={r[2]}" if r[2] else "-"


def main():
    d = json.load(open(os.path.join(HERE, "results.json")))
    o = []
    o.append(f"photos {d['photos']}  GT persons {d['persons']}  reference faces {d['ref_faces']} (width px at full size: min {min(d['ref_face_px'])}, median {statistics.median(d['ref_face_px'])}, max {max(d['ref_face_px'])})")
    o.append("")
    o.append("A. FACE recall by face width after shrinking (95% Wilson interval; trials of one face are correlated, so read as a guide)")
    names = ["yunet0.3", "yunet0.6", "yunet0.9", "haar"]
    o.append("width px | " + " | ".join(names))
    for i, r in enumerate(d["face"]["yunet0.6"]["bins"]):
        o.append(f"{rng(r[0], r[1])} | " + " | ".join(pct(d["face"][n]["bins"][i]) for n in names))
    o.append("")
    o.append("B. Fitted recall = 1/(1+(mid/px)^k); bootstrap over faces, 95% range")
    o.append(f"assumed (capture-bystander): face mid {stats.ASSUMED_MID:g} px k {stats.ASSUMED_K:g}; body mid 40 px k 4")
    for n in names:
        v = d["face"][n]
        o.append(f"face {n}: mid {v['mid']:.1f} px ({v['mid_ci'][0]:.1f}-{v['mid_ci'][1]:.1f}), k {v['k']:.2f} ({v['k_ci'][0]:.2f}-{v['k_ci'][1]:.2f}), {v['n']} trials")
    o.append("body hog: no fit; the stock Dalal-Triggs detector reached at most 4% recall at IoU 0.5 in any height bin (section C), see README")
    for n in ("yolox",):
        v = d["body"][n]
        o.append(f"body {n}: mid {v['mid']:.1f} px height ({v['mid_ci'][0]:.1f}-{v['mid_ci'][1]:.1f}), k {v['k']:.2f} ({v['k_ci'][0]:.2f}-{v['k_ci'][1]:.2f}), {v['n']} trials")
    o.append("")
    o.append("C. PERSON recall by box height (px) after shrinking; upright boxes (h/w >= 1.8), and all boxes for YOLOX")
    o.append("height px | yolox upright | hog upright | yolox all boxes")
    for i, r in enumerate(d["body"]["yolox"]["bins"]):
        o.append(f"{rng(r[0], r[1])} | {pct(r)} | {pct(d['body']['hog']['bins'][i])} | {pct(d['body']['yolox_all_boxes']['bins'][i])}")
    o.append("")
    o.append("D. Per-frame leak among identifiable faces (face-on, >= R px), 8K 360 camera, uniform crowd")
    o.append("detector | R=16 | R=24 | R=32")
    cases = [("assumed mid 20, k 4", stats.ASSUMED_MID, stats.ASSUMED_K)]
    for n in ("yunet0.3", "yunet0.6", "yunet0.9"):
        cases.append((f"measured {n} mid {d['face'][n]['mid']:.1f}, k {d['face'][n]['k']:.2f}", d["face"][n]["mid"], d["face"][n]["k"]))
    for label, mid, k in cases:
        o.append(f"{label} | " + " | ".join(f"{stats.leak_share(mid, k, F_8K, ident_px=R):.4f}" for R in (16, 24, 32)))
    lo, hi = d["face"]["yunet0.6"]["mid_ci"]
    o.append(f"yunet0.6 at the ends of its mid range ({lo:.1f}, {hi:.1f}), k {d['face']['yunet0.6']['k']:.2f}, R=16: "
             f"{stats.leak_share(lo, d['face']['yunet0.6']['k'], F_8K, 16):.4f}, {stats.leak_share(hi, d['face']['yunet0.6']['k'], F_8K, 16):.4f}")
    o.append("")
    j = [t for t in d["joint"] if 8 <= t[0] < 24]
    n = len(j)
    fm = sum(1 - t[1] for t in j) / n if n else float("nan")
    bm = sum(1 - t[2] for t in j) / n if n else float("nan")
    both = sum((1 - t[1]) * (1 - t[2]) for t in j) / n if n else float("nan")
    o.append("E. Do the face and body detectors miss independently? (upright people, face 8-24 px, YuNet 0.6 and YOLOX)")
    o.append("   Here a face that small belongs to a body about 9x taller, which YOLOX finds; the 'both' policy's independence assumption has nothing to bite on.")
    o.append(f"n={n}  P(face miss)={fm:.3f}  P(body miss)={bm:.3f}  product={fm * bm:.3f}  P(both miss)={both:.3f}")
    o.append("")
    ftb = d.get("face_to_body", [])
    if ftb:
        o.append(f"F. Face width / person box height (upright people, n={len(ftb)}): median {statistics.median(ftb):.3f}, min {min(ftb):.3f}, max {max(ftb):.3f}; capture-bystander assumed 0.15/1.7 = 0.088")
    o.append(f"G. Head from a YOLOX body box (n={d['head_cover_n']}): share of faces fully (>=90%) inside the top q of the box, and partly")
    o.append("q | fully | at all")
    for q, v in d["head_cover"].items():
        o.append(f"{q} | {v['full']:.2f} | {v['any']:.2f}")
    o.append("")
    o.append("== H. figure data: face recall by width (bin geometric centre), measured against the assumed curve")
    o.append("width_px yunet0.3 yunet0.6 yunet0.9 haar assumed")
    for i, r in enumerate(d["face"]["yunet0.6"]["bins"][:-1]):
        c = (r[0] * r[1]) ** 0.5
        o.append(f"{c:.1f} " + " ".join(f"{d['face'][n]['bins'][i][4]:.3f}" for n in names) + f" {stats.recall_curve(c, stats.ASSUMED_MID, stats.ASSUMED_K):.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(o) + "\n")
    print("\n".join(o))


if __name__ == "__main__":
    main()
