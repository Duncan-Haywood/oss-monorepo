"""Buckling safety factors over w for gauges b. Writes scan.txt."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_webbuckle import ltb

OUT = os.path.dirname(os.path.abspath(__file__))
L = ["factor = critical load / applied load (F = 100 N, L = H = 80 mm, steel E = 200 GPa, nu = 0.30)",
     "b(mm)  w(mm)  w/b   vertical  horizontal  governing"]
for b in (1.0, 2.0, 3.0):
    for w in (4.0, 6.0, 8.0, 12.0, 16.0, 20.0, 25.0):
        L.append(f"{b:4.1f} {w:6.1f} {w/b:5.1f} {ltb.vertical_arm_factor(w,b):9.2f} "
                 f"{ltb.horizontal_arm_factor(w,b):10.2f} {ltb.governing_factor(w,b):10.2f}")
L.append("")
L.append("smallest w (0.1 mm grid, 3..25 mm) with governing factor >= k, per gauge")
import numpy as np
ws = np.round(np.arange(3.0, 25.01, 0.1), 1)
for b in (1.0, 2.0, 3.0):
    row = []
    for k in (1, 2, 3, 5):
        ok = [w for w in ws if ltb.governing_factor(w, b) >= k]
        row.append(f"k={k}: {ok[0] if ok else 'none'}")
    L.append(f"b={b}: " + ", ".join(row))
open(os.path.join(OUT, "scan.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
