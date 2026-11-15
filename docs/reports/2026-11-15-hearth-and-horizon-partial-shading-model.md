---
kind: note
date: 2026-11-15
subjects: [hearth-and-horizon]
---
# Hearth & Horizon: the partial-shading model behind "The Shadow of the Master's House" (2026-11-15)

For the next run that writes about solar panels, shade or maximum-power tracking.
The story is `ventures/hearth-and-horizon/stories/the-shadow-of-the-masters-house.md`;
its closing note lists every number. This file keeps the model so those numbers
can be rerun, and records the one mistake the first draft made.

## What the model does

`shade.py` (below) is plain Python, no numpy, about five seconds per day at
15-minute steps. It computes the sun's position (NOAA approximation), a crude
clear-sky beam and diffuse irradiance on a 35° south roof, tests each of the
960 cells of sixteen 60-cell landscape panels for shade by ray-casting against
a box (the house), and builds the string's I-V curve with each 20-cell group
limited by its worst cell and a 0.45 V bypass diode. It reports every local
power peak above the inverter's 160 V minimum.

## The mistake the first draft made

The draft assumed that after a shower the tracker always lands on the wrong
(low-current) peak. It doesn't. A perturb-and-observe tracker restarting at the
unshaded maximum-power voltage (about 560 V here) climbs whichever hill that
voltage sits on. The dip between the two peaks was at 578 to 595 V until 13:40
on 14 December, so a 13:00 shower leaves the tracker on the good peak. Only
from about 13:50, once more groups are bypassed and the high peak has moved
down in voltage, does the dip fall below 560 V and a shower strand it.
**Find the saddle voltage, not just the peaks**, before claiming a tracker gets
stuck. Fixing this moved the story's showers to 14:00 and changed the window
figures (0.55 kWh on the low peak all afternoon became 1.68 to 1.75 with a
14:00 shower) and the losses (40 kWh and 15 euro became 20 kWh and 8 euro).

Two other checks the model forced: splitting 10 + 6 onto two inputs is *worse*
than one string with a global scan (2.06 against 2.39 kWh), because the six
fall under the inverter's minimum voltage once two are bypassed; and panels
moved to a flat roof east of the school would be shaded by the school itself
unless that roof stands forward of the school front, so the story puts the
kitchen out into the yard.

## shade.py

```python
"""Partial-shading model for the story: sun path, roof shading per cell, string I-V with bypass diodes.

Invented geometry: a single-storey school roof (south slope, 35 deg pitch, ridge E-W) with a
two-storey house attached at its west end that stands forward (south) of the school front.
Panels: 60-cell (6 x 10), three bypass diodes, each over two adjacent 10-cell columns.
"""
import math, sys

LAT, LON = 53.03, -7.30   # invented village in Co. Laois (approx.)
PITCH = math.radians(35)

def sun(year, month, day, hour_utc):
    # NOAA-style approximation
    n = (math.floor(275 * month / 9) - math.floor((month + 9) / 12) * (1 + math.floor((year - 4 * math.floor(year / 4) + 2) / 3)) + day - 30)
    g = 2 * math.pi / 365 * (n - 1 + (hour_utc - 12) / 24)
    eqt = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
            + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    tst = hour_utc * 60 + eqt + 4 * LON
    ha = math.radians(tst / 4 - 180)
    lat = math.radians(LAT)
    cosz = math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.cos(ha)
    z = math.acos(max(-1, min(1, cosz)))
    el = math.pi / 2 - z
    az = math.atan2(math.sin(ha), math.cos(ha) * math.sin(lat) - math.tan(decl) * math.cos(lat)) + math.pi
    return el, az  # az from north, clockwise

# --- geometry (metres): x east, y north, z up. School front wall (eave line) at y=0.
EAVE_Z = 3.0
# house attached at west end: x in [HX0, 0], y in [HY0, HY1], solid up to height HZ (gable approximated as a box)
HX0, HY0, HY1, HZ = -9.0, -3.5, 7.0, 7.2
# panel layout, landscape: 1.70 m along x, 1.00 m up the slope; rows start 0.4 m up from eave
PW, PH, GAP = 1.70, 1.00, 0.02
X0 = 0.9      # first (west) panel starts 0.9 m east of the house wall
S0 = 0.40
COLS, ROWS = 8, 2

def roof_point(x, s):
    return (x, s * math.cos(PITCH), EAVE_Z + s * math.sin(PITCH))

def shaded(p, el, az):
    if el <= 0:
        return True
    dx, dy, dz = math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)
    # ray p + t d; intersect box x in [HX0,0], y in [HY0,HY1], z in [0,HZ]
    tmin, tmax = 1e-6, 1e9
    for o, d, lo, hi in ((p[0], dx, HX0, 0.0), (p[1], dy, HY0, HY1), (p[2], dz, 0.0, HZ)):
        if abs(d) < 1e-12:
            if o < lo or o > hi:
                return False
            continue
        t1, t2 = (lo - o) / d, (hi - o) / d
        if t1 > t2:
            t1, t2 = t2, t1
        tmin, tmax = max(tmin, t1), min(tmax, t2)
        if tmin > tmax:
            return False
    return True

def cell_centres(col, row):
    """Landscape: 10 cells along x, 6 cells up the slope. Cell rows (up slope) pair into substrings:
    cell-rows 0-1 -> substring 0 (bottom), 2-3 -> 1, 4-5 -> 2 (top)."""
    x0 = X0 + col * (PW + GAP)
    s0 = S0 + row * (PH + GAP)
    out = []
    for i in range(10):
        for j in range(6):
            out.append((j // 2, roof_point(x0 + (i + 0.5) * PW / 10, s0 + (j + 0.5) * PH / 6)))
    return out

def irradiance(el, az):
    """Clear-sky plane-of-array beam and diffuse (W/m2), crude (Meinel DNI, diffuse 15% of DNI-equivalent)."""
    if el <= 0:
        return 0.0, 0.0
    e = math.degrees(el)
    am = 1 / (math.sin(el) + 0.50572 * (e + 6.07995) ** -1.6364)
    dni = 1353 * 0.7 ** (am ** 0.678)
    dhi = 0.12 * 1353 * math.sin(el) ** 0.8 + 20  # crude clear-sky diffuse
    # incidence on a south-facing 35 deg plane
    n = (0.0, -math.sin(PITCH), math.cos(PITCH))
    s = (math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))
    cos_i = max(0.0, sum(a * b for a, b in zip(n, s)))
    beam = dni * cos_i
    diff = dhi * (1 + math.cos(PITCH)) / 2
    return beam, diff

# --- electrical: 330 W-class 60-cell panel at 5 C cell temperature
ISC, N_ID, VT = 10.2, 1.25, 0.02443   # VT at about 10 C
VOC_CELL = 0.683 + 0.0022 * 20        # colder cells: higher voltage
I0 = ISC / math.exp(VOC_CELL / (N_ID * VT))
RS = 0.006
BYPASS = -0.45

def cell_v(i, iph):
    if i >= iph:
        return None
    return N_ID * VT * math.log((iph - i) / I0 + 1) - i * RS

def string_curve(sub_iph):
    """sub_iph: list of substrings, each a list of 20 cell photocurrents. Returns list of (I, V, P)."""
    imax = max(max(s) for s in sub_iph)
    pts = []
    steps = 600
    for k in range(1, steps):
        i = imax * k / steps
        v = 0.0
        for s in sub_iph:
            vs = 0.0
            for iph in s:
                c = cell_v(i, iph)
                if c is None:
                    vs = None
                    break
                vs += c
            v += BYPASS if vs is None else vs
        pts.append((i, v, i * v))
    return pts

def peaks(pts):
    out = []
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        if b[2] >= a[2] and b[2] >= c[2] and b[2] > 0:
            out.append(b)
    return out

def build(el, az, strings):
    beam, diff = irradiance(el, az)
    res = {}
    shade_cells = {}
    for name, panels in strings.items():
        subs = []
        for (col, row) in panels:
            cells = cell_centres(col, row)
            groups = {0: [], 1: [], 2: []}
            for g, p in cells:
                sh = shaded(p, el, az)
                shade_cells[(col, row)] = shade_cells.get((col, row), 0) + (1 if sh else 0)
                g_eff = diff + (0 if sh else beam)
                groups[g].append(ISC * g_eff / 1000)
            subs.extend(groups.values())
        res[name] = subs
    return beam, diff, res, shade_cells

ONE = {"A": [(c, r) for c in range(COLS) for r in range(ROWS)]}

def run(day=15, month=12, year=2046, strings=ONE, step_min=15, verbose=True, vmin=200):
    tot_global = tot_local = tot_clear = 0.0
    rows = []
    for m in range(8 * 60, 16 * 60 + 30, step_min):
        h = m / 60
        el, az = sun(year, month, day, h)
        if el <= 0:
            continue
        beam, diff, res, sc = build(el, az, strings)
        g_sum = l_sum = c_sum = 0
        for name, subs in res.items():
            pts = [p for p in string_curve(subs) if p[1] >= vmin]
            if not pts:
                continue
            pk = peaks(pts) or [max(pts, key=lambda p: p[2])]
            g = max(pk, key=lambda p: p[2])
            loc = min(pk, key=lambda p: p[0])  # the peak nearest open circuit (lowest current)
            g_sum += g[2]; l_sum += loc[2]
            clear = [[ISC * (beam + diff) / 1000] * 20 for _ in subs]
            c_sum += max(p[2] for p in string_curve(clear))
            if verbose:
                pass
        nshade = {k: v for k, v in sc.items() if v}
        rows.append((h, math.degrees(el), math.degrees(az), beam, diff, g_sum, l_sum, c_sum, nshade))
        tot_global += g_sum * step_min / 60
        tot_local += l_sum * step_min / 60
        tot_clear += c_sum * step_min / 60
    return rows, tot_global / 1000, tot_local / 1000, tot_clear / 1000

if __name__ == "__main__":
    rows, g, l, c = run()
    for h, el, az, beam, diff, gp, lp, cp, ns in rows:
        hh = int(h); mm = int(round((h - hh) * 60))
        desc = " ".join(f"{col}{'LU'[r]}:{n}" for (col, r), n in sorted(ns.items()))
        print(f"{hh:02d}:{mm:02d} el {el:5.1f} az {az:5.1f} beam {beam:4.0f} diff {diff:3.0f}  clear {cp:5.0f} W  global {gp:5.0f}  firstpeak {lp:5.0f}  shaded {desc}")
    print(f"day kWh: unshaded {c:.2f}  shaded/global {g:.2f}  shaded/first-peak {l:.2f}")
```

## analyse.py (dishwasher window, fixes)

```python
import shade as s, math
s.HY0=-6; s.HZ=7.2
DAY=(2046,12,15)
def window(strings, vmin=160, t0=13.25, t1=14.75, step=5, mode='global'):
    e_win=e_day=0
    for m in range(8*60+40, 16*60+10, step):
        h=m/60; el,az=s.sun(DAY[0],DAY[1],DAY[2],h)
        if el<=0: continue
        beam,diff,res,sc=s.build(el,az,strings)
        p=0
        for name,subs in res.items():
            pts=[q for q in s.string_curve(subs) if q[1]>=vmin]
            if not pts: continue
            pk=s.peaks(pts) or [max(pts,key=lambda q:q[2])]
            if mode=='global': p+=max(q[2] for q in pk)
            else: p+=min(pk,key=lambda q:q[0])[2]
        e_day+=p*step/60
        if t0<=h<t1: e_win+=p*step/60
    return e_win/1000, e_day/1000
def clear_and_naive(step=5,t0=13.25,t1=14.75):
    cw=cd=nw=nd=0
    allp={"A":[(c,r) for c in range(8) for r in range(2)]}
    for m in range(8*60+40, 16*60+10, step):
        h=m/60; el,az=s.sun(*DAY,h)
        if el<=0: continue
        beam,diff,res,sc=s.build(el,az,allp)
        clear=[[s.ISC*(beam+diff)/1000]*20 for _ in range(48)]
        pc=max(q[2] for q in s.string_curve(clear))
        frac=sum(sc.values())/960
        pn=pc*(1-frac*beam/(beam+diff))
        cd+=pc*step/60; nd+=pn*step/60
        if t0<=h<t1: cw+=pc*step/60; nw+=pn*step/60
    return cw/1000,cd/1000,nw/1000,nd/1000
ONE={"A":[(c,r) for c in range(8) for r in range(2)]}
SPLIT={"A":[(c,r) for c in range(3,8) for r in range(2)],"B":[(c,r) for c in range(0,3) for r in range(2)]}
SPLIT2={"A":[(c,r) for c in range(2,8) for r in range(2)],"B":[(c,r) for c in range(0,2) for r in range(2)]}
#print('clear/naive (win, day, naive win, naive day): %.2f %.2f %.2f %.2f'%clear_and_naive())
#print('one string global', window(ONE))
#print('one string wrong peak', window(ONE,mode='local'))
#print('split 10+6 global', window(SPLIT))
#print('split 10+6 local', window(SPLIT,mode='local'))
#print('split 12+4 global', window(SPLIT2))
```
