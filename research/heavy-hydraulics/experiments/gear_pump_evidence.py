"""Milestone 6r: do three gear-pump makers' break-even sweeps follow one curve of efficiency alone?

Reads only committed results files (no simulation): every scaled-sweep point on 6n's index 2 (overall
efficiency at 150 bar, 2100 r/min, 85 L/min of 20 bar flow) for Casappa (6q's finer grid), Danfoss
(6n) and Marzocchi (6o), each with its own idle drag, at S = 0.38 and the central setting. Fits
share = 100 / (1 + exp(-(E - E50) / w)) by least squares on a grid, pooled and leaving each maker out,
then places the unscaled catalogue points, the piston pump (6j) and the bench pump (6q).

Stdlib only. Usage: python3 gear_pump_evidence.py > gear_pump_evidence_results.txt
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def section(text, start, stop_blank=True):
    """Lines after the first line containing `start`, up to the first blank line."""
    lines = text.splitlines()
    i = next(k for k, ln in enumerate(lines) if start in ln)
    out = []
    for ln in lines[i + 1:]:
        if stop_blank and not ln.strip():
            break
        out.append(ln)
    return out


def casappa():
    t = (HERE / "excavator_gear_pump_bench_results.txt").read_text()
    pts = []
    for ln in section(t, "catalogue (Casappa KAPPA) moving efficiency scaled by c"):
        m = re.search(r"beats 3\.986: ([\d.]+)%.*index 2 ([\d.]+)", ln)
        if m:
            pts.append((float(m.group(2)), float(m.group(1))))
    return pts


def danfoss():
    t = (HERE / "gear_pump_crux_results.txt").read_text()
    pts = []
    for ln in section(t, "danfoss: c sweep on both indices")[1:]:
        f = ln.split()
        if len(f) == 4 and re.fullmatch(r"[\d.]+", f[0]):
            pts.append((float(f[3]), float(f[1])))
    return pts


def marzocchi():
    t = (HERE / "excavator_gear_pump_marzocchi_results.txt").read_text()
    pts = []
    for ln in section(t, "marzocchi: moving efficiency scaled by c"):
        m = re.search(r"beats 3\.986: ([\d.]+)%.*index 2 ([\d.]+)", ln)
        if m:
            pts.append((float(m.group(2)), float(m.group(1))))
    return pts


def own_crossing(pts):
    pts = sorted(pts)
    for (e0, s0), (e1, s1) in zip(pts, pts[1:]):
        if s0 < 50 <= s1:
            return e0 + (50 - s0) * (e1 - e0) / (s1 - s0)
    return None


def logistic(e, e50, w):
    return 100.0 / (1.0 + math.exp(-(e - e50) / w))


def sse(pts, e50, w):
    return sum((s - logistic(e, e50, w)) ** 2 for e, s in pts)


def fit(pts):
    """Grid least squares: coarse pass, then a fine pass around the coarse best (same 1e-4 resolution)."""
    best = None
    for i in range(0, 1501, 10):
        e50 = 0.75 + i * 1e-4
        for j in range(0, 481, 10):
            w = 0.002 + j * 1e-4
            v = sse(pts, e50, w)
            if best is None or v < best[0]:
                best = (v, e50, w)
    _, c_e, c_w = best
    for i in range(-15, 16):
        e50 = round(c_e + i * 1e-4, 4)
        if not 0.75 <= e50 <= 0.90:
            continue
        for j in range(-15, 16):
            w = round(c_w + j * 1e-4, 4)
            if not 0.002 <= w <= 0.05:
                continue
            v = sse(pts, e50, w)
            if v < best[0]:
                best = (v, e50, w)
    return best[1], best[2]


def rms(pts, e50, w):
    return math.sqrt(sse(pts, e50, w) / len(pts))


def main():
    makers = {"casappa": casappa(), "danfoss": danfoss(), "marzocchi": marzocchi()}
    print("Milestone 6r: three makers' scaled break-even sweeps on one efficiency axis (index 2)")
    print("(inputs: excavator_gear_pump_bench_results.txt, gear_pump_crux_results.txt,")
    print(" excavator_gear_pump_marzocchi_results.txt; no simulation rerun)")
    print("share = geometries (of 384) where a smaller fixed pump beats 3.986 L/h at S = 0.38, central setting")
    print("fit: share = 100 / (1 + exp(-(E - E50) / w)), grid least squares (step 1e-4)")
    print()
    for k, pts in makers.items():
        print(f"{k}: {len(pts)} sweep points, E {min(p[0] for p in pts):.4f} to {max(p[0] for p in pts):.4f}; "
              f"own interpolated 50% crossing {own_crossing(pts):.4f}")
    allpts = [p for pts in makers.values() for p in pts]
    e50, w = fit(allpts)
    print()
    print(f"pooled ({len(allpts)} points): E50 {e50:.4f}, w {w:.4f}; RMS residual {rms(allpts, e50, w):.2f} points")
    for k, pts in makers.items():
        res = [s - logistic(e, e50, w) for e, s in pts]
        print(f"  {k}: RMS {rms(pts, e50, w):.2f}, max |residual| {max(abs(r) for r in res):.2f} points")
    print(f"  10% to 90% of geometries between E {e50 - w * math.log(9):.4f} and {e50 + w * math.log(9):.4f}")
    print()
    print("leave one maker out (fit on the other two, predict the third):")
    lomo = {}
    for k, pts in makers.items():
        rest = [p for kk, pp in makers.items() if kk != k for p in pp]
        le, lw = fit(rest)
        own = own_crossing(pts)
        lomo[k] = (le, lw, le - own, rms(pts, le, lw))
        print(f"  without {k}: E50 {le:.4f}, w {lw:.4f}; {k} own crossing {own:.4f}, error {le - own:+.4f}; "
              f"{k} RMS residual {rms(pts, le, lw):.2f} points")
    print()
    print("unscaled and measured points against the pooled curve:")
    marks = [
        ("casappa catalogue (c = 1)", 0.7590, 9.9, "excavator_gear_pump_bench_results.txt"),
        ("danfoss catalogue (c = 1)", 0.8485, 70.1, "gear_pump_crux_results.txt"),
        ("marzocchi catalogue (c = 1)", 0.8975, 99.5, "excavator_gear_pump_marzocchi_results.txt"),
        ("casappa KP30 bench family (6q)", 0.9130, 100.0, "excavator_gear_pump_bench_results.txt"),
        ("piston pump, full stroke (6j; not index 2)", 0.840, 74.0, "gear_pump_crux_results.txt"),
    ]
    for name, e, s, src in marks:
        print(f"  {name}: E {e:.4f}, share {s:.1f}%, curve {logistic(e, e50, w):.1f}%, "
              f"residual {s - logistic(e, e50, w):+.1f}; E - E50 {e - e50:+.4f} ({(e - e50) / w:+.1f} w)")
    print()
    piston = 74.0 - logistic(0.840, e50, w)
    print("Predictions (LOG.md 6r):")
    print(f"  GE1 pooled E50 in 0.820-0.835: {'held' if 0.820 <= e50 <= 0.835 else 'refuted'} ({e50:.4f})")
    worst = max(abs(v[2]) for v in lomo.values())
    print(f"  GE2 every left-out crossing within 0.015: {'held' if worst <= 0.015 else 'refuted'} "
          f"(worst {worst:.4f})")
    r = rms(allpts, e50, w)
    print(f"  GE3 pooled RMS < 6 points: {'held' if r < 6 else 'refuted'} ({r:.2f})")
    worst_r = max(v[3] for v in lomo.values())
    print(f"  GE4 every left-out RMS < 10 points: {'held' if worst_r < 10 else 'refuted'} ({worst_r:.2f})")
    print(f"  GE5 piston point within 15 points: {'held' if abs(piston) <= 15 else 'refuted'} ({piston:+.1f})")


if __name__ == "__main__":
    main()
