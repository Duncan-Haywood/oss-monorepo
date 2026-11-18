"""Milestone 5h: absolute lowering power of the PATU 655 lift cylinder (5g gave only shapes).

Data: PATU 655 forestry crane, Mendeley Data doi:10.17632/rn5j42rpyr.1, CC BY 4.0 (see regen_measured.py).
Cylinder geometry is NOT in the dataset. Milestone 5j SOURCED it: Khadim et al., IEEE Access 10:62863
(2022), Table 2, cylinder 1 (lift boom): piston side A1 = 7.85e-3 m2, rod side A2 = 5.4e-3 m2 (so rod area
2.45e-3 m2; bore 100.0 mm, rod 55.9 mm), which agrees with the 100/56 mm parts-listing reading of 5h. The
"sourced" row below uses those areas; the 80 and 125 mm rows remain as a sensitivity sweep (rod 0.56 of bore). Hydraulic power of one lowering stroke:
    P = (PA1*A - PB1*(A - a)) * |v|      A piston area, a rod area, v = dS1/dt (retraction)
Rod-side pressure is included here (5g neglected it). Strokes are found as in regen_measured.py.
Usage: python regen_watts.py <data dir>
"""
import glob, os, sys
import numpy as np

SMOOTH_S, V_MIN, T_MIN, DS_MIN = 0.5, 5.0, 0.3, 20.0
BORES = (80, 100, 125, "sourced")  # mm; rod = 0.56 * bore; "sourced" = Khadim Table 2 areas

def strokes(path):
    d = np.genfromtxt(path, delimiter=",", names=True)
    t = (d["Timeepoch_ms"] - d["Timeepoch_ms"][0]) / 1e9
    dt = float(np.median(np.diff(t)))
    k = max(1, int(round(SMOOTH_S / dt))); box = np.ones(k) / k
    sm = lambda x: np.convolve(x, box, mode="same")
    s, pa, pb = sm(d["S1mm"]), sm(d["PA1bar"]), sm(d["PB1bar"])
    v = np.gradient(s, dt)
    low = v < -V_MIN
    out, i, n = [], 0, len(t)
    while i < n:
        if low[i]:
            j = i
            while j < n and low[j]: j += 1
            if (j - i) * dt >= T_MIN and s[i] - s[j - 1] >= DS_MIN:
                out.append((dt, pa[i:j].copy(), pb[i:j].copy(), -v[i:j]))  # bar, bar, mm/s
            i = j
        else: i += 1
    return out

SOURCED = (7.85e-3, 2.45e-3)  # m2: piston area A1, rod area A1 - A2 (Khadim et al. 2022, Table 2)

def watts(st, bore_mm):
    dt, pa, pb, v = st
    if bore_mm == "sourced": A, a = SOURCED
    else: A = np.pi / 4 * (bore_mm * 1e-3) ** 2; a = np.pi / 4 * (0.56 * bore_mm * 1e-3) ** 2
    f = np.clip(pa * 1e5 * A - pb * 1e5 * (A - a), 0, None)  # N
    p = f * v * 1e-3
    return p, len(p) * dt

if __name__ == "__main__":
    rows = {b: [] for b in BORES}
    for f in sorted(glob.glob(os.path.join(sys.argv[1], "*", "*.csv"))):
        kg = os.path.basename(os.path.dirname(f))
        for st in strokes(f):
            for b in BORES:
                p, T = watts(st, b)
                rows[b].append((kg, p.mean(), p.max(), T, p.mean() * T))
    for b in BORES:
        a = np.array([r[1:] for r in rows[b]])
        q = lambda c: " / ".join(f"{np.percentile(a[:, c], x):.0f}" for x in (10, 50, 90))
        print(f"bore {b}{'' if b=='sourced' else ' mm'} (rod {0.56*b if b!='sourced' else 55.9:.0f}) n={len(a)}  mean W {q(0)} | peak W {q(1)} | "
              f"duration ms {' / '.join(f'{1e3*np.percentile(a[:,2],x):.0f}' for x in (10,50,90))} | energy J {q(3)}   (p10/median/p90)")
    for kg in sorted(set(r[0] for r in rows["sourced"])):
        a = np.array([r[1:] for r in rows["sourced"] if r[0] == kg])
        print(f"  sourced, {kg:6} n={len(a):4d} median mean W {np.median(a[:,0]):.0f}, median peak W {np.median(a[:,1]):.0f}")
