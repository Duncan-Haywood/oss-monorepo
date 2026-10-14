"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from corridor_twin.model import (corridor, room, gapped_corridor, scan, icp, sandwich_cov, cov_from, eig_sym3_min_max,
                                 observable, run_filter)

SIGMA = 0.02
POSE = (30.0, 0.2, 0.05)


def mc(segs, pose, off, n, seed=3):
    rng = random.Random(seed)
    E = []
    for _ in range(n):
        e = icp(segs, scan(segs, pose, SIGMA, rng), (pose[0] + off, pose[1], pose[2]))
        E.append([e[i] - pose[i] for i in range(3)])
    m = [sum(e[i] for e in E) / n for i in range(3)]
    sd = [math.sqrt(sum((e[i] - m[i]) ** 2 for e in E) / (n - 1)) for i in range(3)]
    return m, sd, sum(1 for e in E if abs(e[0]) > 0.05) / n


print("Corridor twin: 2D lidar (360 rays, range noise sigma=%g m), point-to-line scan matching, pose=(x,y,theta)" % SIGMA)
print("corridor width 2 m; door-frame stubs 0.3 m deep on both walls at the given spacing; 'room' = 20 m square (the well-featured twin)")

print("\n== 1. Information and accuracy at the true pose: exact sandwich covariance vs Monte Carlo ICP (200 scans, start 0.05 m off along track) ==")
print("  scene          lam_min   lam_max    cond      sd_x exact   sd_x MC    sd_y exact  sd_y MC    sd_th exact  sd_th MC   x-sd vs room")
rows = [("room", room(20.0), (1.0, 0.5, 0.1))]
rows += [("corridor none", corridor(60, 2), POSE)] + [("corridor %g m" % s, corridor(60, 2, s), POSE) for s in (20, 10, 5, 2)]
sd_room = None
for name, segs, pose in rows:
    A, B = sandwich_cov(segs, pose, SIGMA)
    m, sd, _ = mc(segs, pose, 0.05, 200)
    try:
        lo, hi = eig_sym3_min_max(A)
        C = cov_from(A, B)
        ex = [math.sqrt(C[i][i]) for i in range(3)]
        if sd_room is None:
            sd_room = ex[0]
        print("  %-14s %-9.4g %-10.4g %-9.3g %-11.5f %-10.5f %-11.6f %-10.6f %-12.7f %-10.7f %.1fx" % (
            name, lo, hi, hi / lo, ex[0], sd[0], ex[1], sd[1], ex[2], sd[2], ex[0] / sd_room))
    except ZeroDivisionError:
        print("  %-14s information matrix exactly singular (x column is zero); MC sd_x = %.2e, mean x error = %.4f (= the start error: the scan returns the initial guess); sd_y %.6f sd_th %.7f" % (
            name, sd[0], m[0], sd[1], sd[2]))

print("\n== 2. Basin of convergence: corridor with stubs every 10 m, ICP started `off` m behind the true x (100 scans) ==")
print("  off    mean x err   sd x err    fraction |x err| > 0.05 m")
for off in (0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0):
    m, sd, fr = mc(corridor(60, 2, 10), POSE, off, 100, seed=5)
    print("  %-6g %-12.4f %-11.4f %.2f" % (off, m[0], sd[0], fr))

print("\n== 3. Kalman filter on x fed by scan-matching x; 60 m corridor, stubs every 5 m except a featureless span 15-45 m (no stub within 10 m of x in 20-40, the 'blind' span); lidar range 10 m, 180 rays ==")
segs = gapped_corridor()
A, B = sandwich_cov(room(10.0), (0.5, 0.2, 0.05), SIGMA, 180, 10.0)
R_twin = cov_from(A, B)[0][0]
print("  twin measurement sd (10 m room, same sensor) = %.5f m, used at every step; 'real' filter uses the exact sandwich sd and skips an unobservable scan" % math.sqrt(R_twin))
N = 40
print("  runs per row = %d, 100 steps of 0.5 m; NEES = mean of err^2/P over the steps in each zone (consistent filter: about 1)" % N)
print("  odo sd   filter   NEES x<20   NEES 20-40 (blind)      NEES x>40   RMSE at blind exit (x=40)   RMSE at end   mean claimed sd in blind span (m)")
for so in (0.01, 0.02):
    for mode in ("odo", "twin", "real"):
        ne = [[], [], []]
        exit_e, fin, claim = [], [], []
        for s in range(N):
            r = run_filter(segs, random.Random(s), mode, R_twin=R_twin, sig_odo=so)
            for xt, e, P in r:
                z = 0 if xt < 20 else (1 if xt <= 40 else 2)
                ne[z].append(e * e / max(P, 1e-12))
                if z == 1:
                    claim.append(math.sqrt(P))
            exit_e.append([e for xt, e, P in r if abs(xt - 40.0) < 1e-9][0])
            fin.append(r[-1][1])
        rm = lambda v: math.sqrt(sum(t * t for t in v) / len(v))
        print("  %-8g %-8s %-11.2f %-26.2f %-11.2f %-25.4f %-13.4f %.4f" % (
            so, mode, sum(ne[0]) / len(ne[0]), sum(ne[1]) / len(ne[1]), sum(ne[2]) / len(ne[2]), rm(exit_e), rm(fin),
            sum(claim) / len(claim)))
