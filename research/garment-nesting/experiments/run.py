"""Experiments for garment-nesting. Writes experiments/results.txt. Run: PYTHONPATH=src python experiments/run.py"""
import os, sys, time
import numpy as np
from garment_nesting import *
from garment_nesting.rect import length

OUT = []
def say(s=""):
    print(s); OUT.append(s)

def arc(p0, p1, bulge, n=8):
    """Quadratic curve from p0 to p1 with control point offset `bulge` (cm) normal to the chord."""
    (x0, y0), (x1, y1) = p0, p1
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    L = (dx * dx + dy * dy) ** 0.5
    cx, cy = mx - dy / L * bulge, my + dx / L * bulge
    return [((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1)
            for t in np.linspace(0, 1, n)[1:-1]] + [p1]

def poly(*segs):
    pts = []
    for s in segs:
        pts += s if isinstance(s, list) else [s]
    return tuple((float(x), float(y)) for x, y in pts)

# Stylised pieces: my own shapes, no real pattern, no seam allowance, one ply, one size.
def shirt():
    back = Piece("back", poly((0, 0), (54, 0), (54, 44), arc((54, 44), (47, 70), -6), (36, 74),
                              arc((36, 74), (18, 74), -5), (7, 70), arc((7, 70), (0, 44), -6)))
    front = Piece("front", poly((0, 0), (30, 0), (30, 44), arc((30, 44), (23, 70), -6), (12, 74),
                                arc((12, 74), (0, 62), 4)))
    sleeve = Piece("sleeve", poly((0, 0), (22, 0), (38, 46), arc((38, 46), (19, 58), 5), arc((19, 58), (-4, 46), 5), (0, 0)))
    collar = Piece("collar", poly((0, 0), (46, 0), (44, 6), (2, 6)))
    cuff = Piece("cuff", poly((0, 0), (24, 0), (24, 8), (0, 8)))
    pocket = Piece("pocket", poly((0, 0), (12, 0), (12, 11), (6, 14), (0, 11)))
    return [back, front, front, sleeve, sleeve, collar, cuff, cuff, pocket]

def skirt():
    gore = Piece("gore", poly((13, 0), (31, 0), (44, 60), (0, 60)))
    band = Piece("waistband", poly((0, 0), (84, 0), (84, 8), (0, 8)))
    return [gore] * 4 + [band]

def bbox(p):
    xs = [q[0] for q in p.poly]; ys = [q[1] for q in p.poly]
    return (max(xs) - min(xs), max(ys) - min(ys))

def rect_instance(rng, n, W):
    return [(float(rng.integers(10, 61)), float(rng.integers(10, 81))) for _ in range(n)]

# ---- A: rectangles, small markers, greedy vs annealing vs exact ----
say("A. Random rectangle markers: n=8 boxes, 10..60 x 10..80 cm, fabric width 100 cm, 20 instances (seed 0).")
say("   SA = 500 bottom-left decodes. Exact = MILP (HiGHS), 30 s limit per instance.")
rng = np.random.default_rng(0)
rows = []
for k in range(20):
    pcs = rect_instance(rng, 8, 100)
    t0 = time.time(); ex_pos, ex_L, ex_opt = exact_rect(pcs, 100, time_limit=30); t_ex = time.time() - t0
    assert ex_pos is not None and valid_layout(pcs, ex_pos, 100)
    res = {"NFDH": length(pcs, nfdh(pcs, 100)), "FFDH": length(pcs, ffdh(pcs, 100)),
           "BL-area": length(pcs, bottom_left(pcs, 100, sorted(range(8), key=lambda i: -pcs[i][0] * pcs[i][1])))}
    pos, L = anneal_rect(pcs, 100, evals=500, seed=k)
    assert valid_layout(pcs, pos, 100)
    res["SA"] = L
    rows.append((area_bound(pcs, 100), ex_L, ex_opt, t_ex, res))
opt_rows = [r for r in rows if r[2]]
say(f"   exact proved optimal on {len(opt_rows)}/20 instances (median solve {np.median([r[3] for r in rows]):.1f} s).")
say(f"   mean area bound / optimum (proved only): {np.mean([r[0] / r[1] for r in opt_rows]):.3f}  (1.0 = no waste possible beyond the area)")
say("   method   mean gap to exact (%)  worst gap (%)  #matches exact   [proved-optimal instances only]")
for m in ["NFDH", "FFDH", "BL-area", "SA"]:
    gaps = np.array([(r[4][m] / r[1] - 1) * 100 for r in opt_rows])
    say(f"   {m:8s} {gaps.mean():8.1f}  {gaps.max():14.1f}  {int((gaps < 1e-6).sum()):6d}")
sa_better = sum(1 for r in rows if r[4]["SA"] < r[4]["BL-area"] - 1e-9)
say(f"   SA beat plain bottom-left on {sa_better}/20 instances.")
say(f"   mean efficiency (piece area / (W x L)): area bound on the optimum {np.mean([r[0] / r[1] for r in opt_rows]):.3f} (proved instances); "
    f"NFDH {np.mean([r[0] / r[4]['NFDH'] for r in rows]):.3f}, BL {np.mean([r[0] / r[4]['BL-area'] for r in rows]):.3f}, SA {np.mean([r[0] / r[4]['SA'] for r in rows]):.3f}")
say()

# ---- B: stylised garments: bounding boxes vs true polygons ----
say("B. Stylised garments, one ply, no seam allowance, grain kept (180-degree turns only), 2 cm raster.")
say("   efficiency = true piece area / (fabric width x marker length). SA: 200 decodes, mean (min-max) over 5 seeds.")
say("   'bbox' packs each piece's bounding box (rectangles, exact MILP when n<=9 else SA); 'poly' packs the polygons.")
say(f"   {'garment':7s} {'W':>4s} {'area m2':>8s} | {'bbox NFDH':>9s} {'bbox SA':>9s} | {'poly BL':>8s} {'poly SA':>16s} | eff bbox-NFDH -> poly-SA")
summary = []
for gname, pieces in [("shirt", shirt()), ("skirt", skirt())]:
    area = sum(polygon_area(p.poly) for p in pieces)
    boxes = [bbox(p) for p in pieces]
    for W in [110, 140, 150]:
        if max(b[0] for b in boxes) > W:
            continue
        bn = length(boxes, nfdh(boxes, W))
        bs = min(anneal_rect(boxes, W, evals=500, seed=s)[1] for s in range(5))
        order = sorted(range(len(pieces)), key=lambda i: -polygon_area(pieces[i].poly))
        _, pb, occ0 = nest_raster(pieces, W, order, [False] * len(pieces))
        ps = [anneal_raster(pieces, W, evals=200, seed=s)[1] for s in range(5)]
        pa = area / 1e4
        eff = lambda L: area / (W * L)
        summary.append((gname, W, eff(bn), eff(min(ps))))
        say(f"   {gname:7s} {W:4d} {pa:8.3f} | {bn:7.1f}cm {bs:7.1f}cm | {pb:6.1f}cm {np.mean(ps):6.1f}cm ({min(ps):.0f}-{max(ps):.0f}) | "
            f"{eff(bn):.3f} -> {eff(min(ps)):.3f}   (area bound {area / W:.1f} cm)")
say()
say("   Marker efficiency range over these runs (best poly SA): "
    f"{min(s[3] for s in summary):.3f} to {max(s[3] for s in summary):.3f}; bbox-NFDH: {min(s[2] for s in summary):.3f} to {max(s[2] for s in summary):.3f}.")
say("   For reference, garment-teardown assumed a marker efficiency of 0.78 to 0.80 for its coats (an assumption, not a measurement).")

# ---- C: fabric cost of the difference ----
say()
say("C. What the efficiency gap costs, per garment, at the assumed cloth price of $7/m^2 (garment-teardown replica price; an assumption):")
for gname, W, e0, e1 in summary:
    pieces = shirt() if gname == "shirt" else skirt()
    area = sum(polygon_area(p.poly) for p in pieces) / 1e4
    c0, c1 = area / e0 * 7, area / e1 * 7
    say(f"   {gname} W={W}: bbox-NFDH uses {area / e0:.3f} m^2 (${c0:.2f}); poly-SA uses {area / e1:.3f} m^2 (${c1:.2f}); saving ${c0 - c1:.2f}")

path = os.path.join(os.path.dirname(__file__), "results.txt")
open(path, "w").write("\n".join(OUT) + "\n")
