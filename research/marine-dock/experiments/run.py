"""Sweep strategy x near-dock speed x cross current x position noise; N seeds each (g = 0.5 m, 30 deg)."""
import sys, math
sys.path.insert(0, "src")
from marine_dock.dock import run
N = 60
print("# capture-rate % over", N, "seeds; y0 ~ U(-5,5) m, hs = 0.25, compass 1 deg, AR(1) tau 5 s")
print("strategy u_near cy crab_deg sigma  capture% miss% timeout%")
for un in (0.5, 0.8, 1.0):
    for cy in (0.0, 0.1, 0.2, 0.3):
        crab = math.degrees(math.asin(min(1.0, cy / un)))
        for sg in (0.0, 0.1, 0.25, 0.5, 1.0):
            for st in ("pursuit", "los", "ilos"):
                r = [run(st, cy=cy, sigma=sg, seed=i, u_near=un) for i in range(N)]
                c = sum(x["outcome"] == "capture" for x in r)
                m = sum(x["outcome"] == "miss" for x in r)
                print(f"{st:8s} {un:4.2f} {cy:4.2f} {crab:5.1f} {sg:4.2f}  {100*c/N:5.1f} {100*m/N:5.1f} {100*(N-c-m)/N:5.1f}", flush=True)
