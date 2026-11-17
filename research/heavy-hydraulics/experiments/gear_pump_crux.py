"""Milestone 6n: do the two gear-pump makers' break-even sweeps collapse onto one efficiency threshold?

Reads only committed results (numbers are never retyped):
  excavator_gear_pump_results.txt          (6k, Casappa KAPPA 30 as the fixed pump)
  excavator_gear_pump_danfoss_results.txt  (6m, Danfoss GearMe SNP3 as the fixed pump; 6j piston variant)

Each c-sweep point (share of 384 geometries where a smaller fixed pump beats 3.986 L/h at S = 0.38,
central setting) is placed on an absolute efficiency axis:
  index 1: c x median eta_t(150 bar, 2100 r/min) over the maker's sizes whose 20 bar flow lies in the
           range both makers cover (55.8 to 157.3 L/min);
  index 2: c x eta_t(150) interpolated in 20 bar flow at 85 L/min.
The 50% crossing is interpolated linearly between adjacent sweep points. Predictions: LOG.md, 6n.
Stdlib only. Usage: python3 gear_pump_crux.py > gear_pump_crux_results.txt
"""
import re
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
CAS = (HERE / "excavator_gear_pump_results.txt").read_text().splitlines()
DAN = (HERE / "excavator_gear_pump_danfoss_results.txt").read_text().splitlines()
Q_REF = 85.0
TARGET = 50.0


def size_table(lines, header_start, q_col, eta_col):
    """Rows (size, Q20, eta_t(150)) of the per-size table whose header line starts with header_start."""
    out, on = [], False
    for l in lines:
        if l.strip().startswith(header_start):
            on = True
            continue
        if on:
            t = l.split()
            if not t or not t[0].isdigit():
                break
            out.append((t[0], float(t[q_col]), float(t[eta_col])))
    return out


def sweep(lines, heading):
    """(c, share %) points of the c-sweep block whose heading line starts with heading."""
    out, on = [], False
    for l in lines:
        if l.startswith(heading):
            on = True
            continue
        if on:
            m = re.match(r"\s+c (\d\.\d+): .*beats 3\.986: ([\d.]+)%", l)
            if not m:
                break
            out.append((float(m.group(1)), float(m.group(2))))
    return out


def share_line(lines, heading, setting="S = 0.38"):
    on = False
    for l in lines:
        if l.startswith(heading):
            on = True
            continue
        if on and l.strip().startswith(setting):
            return float(re.search(r"beats 3\.986: ([\d.]+)%", l).group(1))
    raise ValueError(heading)


def interp(xs, ys, x):
    pts = sorted(zip(xs, ys))
    if x <= pts[0][0]:
        (a, fa), (b, fb) = pts[0], pts[1]
    elif x >= pts[-1][0]:
        (a, fa), (b, fb) = pts[-2], pts[-1]
    else:
        i = next(k for k in range(len(pts) - 1) if pts[k][0] <= x <= pts[k + 1][0])
        (a, fa), (b, fb) = pts[i], pts[i + 1]
    return fa + (fb - fa) * (x - a) / (b - a)


def crossing(es, shares, target=TARGET):
    pts = sorted(zip(es, shares))
    for (a, fa), (b, fb) in zip(pts, pts[1:]):
        if (fa - target) * (fb - target) <= 0 and fa != fb:
            return a + (b - a) * (target - fa) / (fb - fa)
    return None


# per-size tables: Casappa columns size V Q20 eta_v eta_t100 eta_t150 ...; Danfoss size V Q20 Q7/Vn eta_v eta_t100 eta_t150 ...
cas_sizes = size_table(CAS, "size  V cm3/r  Q20 L/min  eta_v(150)", 2, 5)
dan_sizes = size_table(DAN, "size  V cm3/r  Q20 L/min  Q7/(Vn)", 2, 6)
assert len(cas_sizes) == 8 and len(dan_sizes) == 10, (len(cas_sizes), len(dan_sizes))


# the 20 bar flow range both makers cover, from the tables themselves (55.81 to 157.35 L/min)
Q_SHARED = (max(min(r[1] for r in cas_sizes), min(r[1] for r in dan_sizes)),
            min(max(r[1] for r in cas_sizes), max(r[1] for r in dan_sizes)))


def in_shared(rows):
    return [r for r in rows if Q_SHARED[0] <= r[1] <= Q_SHARED[1]]


def at_q(rows, q):
    return interp([r[1] for r in rows], [r[2] for r in rows], q)


idx = {
    "casappa": (statistics.median(r[2] for r in in_shared(cas_sizes)), at_q(cas_sizes, Q_REF)),
    "danfoss": (statistics.median(r[2] for r in in_shared(dan_sizes)), at_q([r for r in dan_sizes if r[0] != "90"], Q_REF)),
}
idx["danfoss, casappa idle"] = idx["danfoss"]

sweeps = {
    "casappa": sweep(CAS, "Gear pump efficiency (moving part) scaled by c"),
    "danfoss": sweep(DAN, "danfoss: moving efficiency scaled by c"),
    "danfoss, casappa idle": sweep(DAN, "danfoss moving, casappa idle: moving efficiency scaled by c"),
}
for k, v in sweeps.items():
    assert len(v) >= 4, (k, v)
piston_eta = 0.840
piston_share = share_line(DAN, "piston (6j), central setting")

print("Milestone 6n: the Casappa (6k) and Danfoss (6m) break-even sweeps on one absolute efficiency axis")
print("(inputs: excavator_gear_pump_results.txt and excavator_gear_pump_danfoss_results.txt only; no simulation rerun)")
print("share = geometries (of 384) where a smaller fixed pump beats 3.986 L/h at S = 0.38, central setting")
print()
print("per-size overall efficiency at 150 bar, 2100 r/min, inside the shared 20 bar flow range "
      f"{Q_SHARED[0]} to {Q_SHARED[1]} L/min:")
for name, rows in (("casappa", cas_sizes), ("danfoss", dan_sizes)):
    sh = in_shared(rows)
    print(f"  {name}: sizes {', '.join(r[0] for r in sh)}; eta_t(150) "
          + ", ".join(f"{r[2]:.3f}" for r in sh))
    print(f"    index 1 (median) {idx[name][0]:.4f}; index 2 (at Q20 {Q_REF:.0f} L/min) {idx[name][1]:.4f}")
print(f"  piston pump (6g, 60 C, full stroke) {piston_eta:.3f}; its share at S = 0.38 {piston_share:.1f}%")
print()

cross = {}
for name, pts in sweeps.items():
    print(f"{name}: c sweep on both indices")
    print("     c   share %   index 1   index 2")
    for c, s in pts:
        print(f"  {c:.2f}  {s:7.1f}   {c * idx[name][0]:.4f}    {c * idx[name][1]:.4f}")
    cs = [p[0] for p in pts]
    ss = [p[1] for p in pts]
    c50 = crossing(cs, ss)
    e1 = c50 * idx[name][0] if c50 else None
    e2 = c50 * idx[name][1] if c50 else None
    at_piston = interp([c * idx[name][0] for c in cs], ss, piston_eta)
    cross[name] = (c50, e1, e2, at_piston)
    print(f"  50% crossing: c {c50:.4f}; index 1 {e1:.4f}; index 2 {e2:.4f}")
    print(f"  share interpolated at index 1 = {piston_eta:.3f}: {at_piston:.1f}% (piston point {piston_share:.1f}%, "
          f"difference {at_piston - piston_share:+.1f} points)")
    print()

ca, da, dc = cross["casappa"], cross["danfoss"], cross["danfoss, casappa idle"]
gap1 = da[1] - ca[1]
gap2 = da[2] - ca[2]
gap1c = dc[1] - ca[1]
mean1 = (ca[1] + da[1]) / 2
print("summary")
print(f"  index 1 crossings: casappa {ca[1]:.4f}, danfoss {da[1]:.4f}; gap {gap1:+.4f}; mean {mean1:.4f}")
print(f"  index 2 crossings: casappa {ca[2]:.4f}, danfoss {da[2]:.4f}; gap {gap2:+.4f}")
print(f"  danfoss moving with casappa idle, index 1 crossing {dc[1]:.4f}; gap to casappa {gap1c:+.4f}")
print(f"  each maker's share at {piston_eta:.3f} vs piston {piston_share:.1f}%: casappa {ca[3]:.1f}%, danfoss {da[3]:.1f}%")
print()
print("Predictions (LOG.md 6n):")
v = lambda ok: "held" if ok else "refuted"
print(f"  GX1 index-1 crossings differ by < 0.02: {v(abs(gap1) < 0.02)} ({gap1:+.4f})")
print(f"  GX2 mean index-1 crossing in 0.81-0.84: {v(0.81 <= mean1 <= 0.84)} ({mean1:.4f})")
print(f"  GX3 piston point within 10 points of each sweep at 0.840: "
      f"{v(abs(ca[3] - piston_share) <= 10 and abs(da[3] - piston_share) <= 10)} "
      f"(casappa {ca[3] - piston_share:+.1f}, danfoss {da[3] - piston_share:+.1f})")
print(f"  GX4 index-2 crossings differ by < 0.02: {v(abs(gap2) < 0.02)} ({gap2:+.4f})")
print(f"  GX5 Casappa idle on Danfoss shrinks the index-1 gap: {v(abs(gap1c) < abs(gap1))} "
      f"({gap1:+.4f} -> {gap1c:+.4f})")
