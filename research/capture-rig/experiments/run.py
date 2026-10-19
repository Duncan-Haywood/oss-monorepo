"""Write experiments/results.txt. Deterministic.

    PYTHONPATH=src python experiments/run.py
"""
from pathlib import Path
from capture_rig.model import (ring, rms_error, max_gap_deg, mean_view_miss_deg,
                               pixels_on_subject, fits)

HERE = Path(__file__).resolve().parent
R, FOV = 3.0, 60.0


def fmt(e):
    return '  n/a (collinear rays)' if e is None else f'{1000*e:7.2f}'

out = []
p = out.append
p(f"Assumptions: subject 1.8 m at origin, cameras look at it, radius {R} m, vertical FOV {FOV} deg,")
p("3840 px long side (portrait), matching noise 0.5 px. All assumed; 2-D geometry, no occlusion.")
p(f"Pixels on subject height at {R} m: {pixels_on_subject(R, FOV):.0f}; whole subject in frame: {fits(R, FOV)}")
p("")
p("A. Full ring of N cameras: gap, mean miss to wanted direction, centre error (mm)")
p("N  gap_deg  miss_deg  err_mm")
for n in (2, 3, 4, 6, 8, 12, 16):
    c = ring(n, R)
    p(f"{n:<2d} {max_gap_deg(c):7.1f}  {mean_view_miss_deg(c):7.2f}  {fmt(rms_error(c, FOV))}")
p("")
p("B. Same N on a 90 deg front arc (what a creator can put in front of themselves): error (mm)")
p("N  err_mm  arc_span_deg")
for n in (2, 3, 4, 6, 8):
    c = ring(n, R, span_deg=90, start_deg=-45)
    p(f"{n:<2d} {fmt(rms_error(c, FOV))}  {90:7.1f}")
p("")
p("C. Two cameras, baseline between them (convergence angle), error (mm)")
p("conv_deg  baseline_m  err_mm")
for g in (5, 10, 20, 40, 90, 180):
    import math
    c = ring(2, R, span_deg=g, start_deg=-g / 2)
    b = math.dist(c[0], c[1])
    p(f"{g:<8d}  {b:9.2f}  {fmt(rms_error(c, FOV))}")
p("")
p("D. Lens choice, 4-camera full ring at 3 m: error (mm) and whether the subject fits")
p("vfov_deg  err_mm  fits  px_on_subject")
for v in (30, 45, 60, 90, 120):
    c = ring(4, R)
    p(f"{v:<8d}  {fmt(rms_error(c, v))}  {fits(R, v)!s:5}  {pixels_on_subject(R, v):.0f}")
p("")
p("E. Cameras needed on a full ring so no wanted direction is further than half the gap from a camera")
for tgt in (30, 20, 15, 10):
    n = next(n for n in range(2, 60) if max_gap_deg(ring(n, R)) <= tgt)
    p(f"max gap <= {tgt} deg -> N = {n}, mean miss {mean_view_miss_deg(ring(n, R)):.1f} deg")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
