"""Milestone 4s, step 1: pick a third set of 13 views from each TUM RGB-D sequence, disjoint from A and B.

    python3 experiments/m4s_third/prepare.py fr1 <dir>/rgbd_dataset_freiburg1_rgb_calibration
    python3 experiments/m4s_third/prepare.py fr3 <dir>/rgbd_dataset_freiburg3_calibration_rgb_depth

The sequences are fetched by experiments/m4j_tum/fetch.sh (TUM RGB-D benchmark, Sturm et al., IROS
2012; CC BY 4.0). Milestone 4p's prepare.py (milestone 4j's detection, orientation, spacing floor, 13
time blocks and pick rule) is imported unchanged and must reproduce pool A (4j's 13 frames) and pool B
(4p's 13 fresh frames) exactly. The only change, fixed in LOG.md (milestone 4s planned) before any
solve: in each block the frames A and B kept, and every frame within GAP seconds of either, are removed
before the pick. GAP is 0.5 s, not 4p's 1.0 s: the blocks span about 2.1 s (fr1) and 2.3 s (fr3), and
1.0 s around two frames left no candidate in 12 of 13 blocks on each unit (LOG.md, amendment). Writes corners_<unit>c.json in 4j's format.
"""
import importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
M4P = os.path.join(ROOT, "experiments", "m4p_fresh")
_spec = importlib.util.spec_from_file_location("m4p_prepare", os.path.join(M4P, "prepare.py"))
p4p = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(p4p)
p4j = p4p.p4j

GAP = 0.5   # s either side of A's and B's kept frames (1.0 s, as in 4p, left no frame in most blocks)


def pick_c(block, exclude):
    """4j's pick rule on the block's frames more than GAP seconds from every frame in `exclude`."""
    left = [r for r in block if all(abs(r["t"] - t) > GAP for t in exclude)]
    if not left:
        return None, 0
    med = np.median([r["sharp"] for r in left])
    return max((r for r in left if r["sharp"] >= med), key=lambda r: r["tilt"]), len(left)


def main(unit, seq):
    with open(os.path.join(M4J := p4p.M4J, f"corners_{unit}.json")) as fh:
        a = json.load(fh)
    with open(os.path.join(M4P, f"corners_{unit}b.json")) as fh:
        b = json.load(fh)
    frames, found, size = p4p.detect_all(seq)
    assert len(found) == a["n_detected"], (len(found), a["n_detected"])
    blocks = [[found[i] for i in blk] for blk in np.array_split(np.arange(len(found)), p4j.NV)]
    A = [p4p.pick(blk) for blk in blocks]
    assert [r["name"] for r in A] == [v["name"] for v in a["views"]], "4j's selection not reproduced"
    B = [p4p.pick(blk, r["t"]) for blk, r in zip(blocks, A)]
    assert [r["name"] for r in B] == [v["name"] for v in b["views"]], "4p's selection not reproduced"
    picks = [pick_c(blk, (ra["t"], rb["t"])) for blk, ra, rb in zip(blocks, A, B)]
    left = [n for _, n in picks]
    assert all(r is not None for r, _ in picks), ("a block has no frame left", left)
    C = [r for r, _ in picks]
    gaps = [min(abs(c["t"] - ra["t"]), abs(c["t"] - rb["t"])) for c, ra, rb in zip(C, A, B)]
    out = dict(unit=unit + "c", source=a["source"], pattern=list(p4j.PATTERN), size=list(size),
               n_frames=len(frames), n_detected=len(found), gap_s=GAP, views=C, candidates_left=left,
               gap_to_ab_s=gaps, block_sizes=[len(blk) for blk in blocks])
    with open(os.path.join(HERE, f"corners_{unit}c.json"), "w") as fh:
        json.dump(out, fh)
    print(unit + "c", len(found), "detected; A and B reproduced; candidates left per block:", left)
    print("  views:", [r["name"] for r in C])
    print("  seconds from the nearest A or B frame:", [round(g, 2) for g in gaps])
    print("  spacing", [round(r["spacing"], 1) for r in C], "tilt", [round(r["tilt"], 3) for r in C])
    print("  median tilt A / B / C:", *(round(float(np.median([r["tilt"] for r in P])), 3) for P in (A, B, C)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
