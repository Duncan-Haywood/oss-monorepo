"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import random
from flyingpixel_twin.model import (ghost_band, ghost_width, ghost_centre, ghost_width_scan, ghosts_per_edge,
                                    p_edge_has_ghost, strongest_return_edge_shift, eps_for_width, simulate_scan,
                                    ghost_persistence, merged_range, twin_range)

print("Flying-pixel twin: real = Gaussian beam over a depth edge (near r1, far r1+D) with merged pulses (energy centroid);")
print("twin = single ray (near or far, never between). Offsets u in beam std; ghost = return > eps from both surfaces.")

print("\n== 1. Ghost-band width (beam std), equal energies (kappa = 1): closed form 2*Phi^-1(1-eps/D) vs direct scan ==")
print("  eps/D   closed-form  direct-scan")
for e in (0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.49, 0.5):
    print("  %-6g  %-11.4f  %.4f" % (e, ghost_width(e, 1.0), ghost_width_scan(e, 1.0, du=1e-4)))

print("\n== 2. Unequal energies at eps/D = 0.1: kappa = far/near received energy at half coverage ==")
print("  kappa   band (u_lo, u_hi)      width    centre   strongest-return switch u*")
for k in (0.01, 0.1, 0.3, 1.0, 3.0, 10.0, 100.0):
    lo, hi = ghost_band(0.1, k)
    print("  %-6g  (%7.3f, %7.3f)   %-7.4f  %-7.3f  %.3f" % (k, lo, hi, hi - lo, ghost_centre(0.1, k), strongest_return_edge_shift(k)))
print("  (u > 0: beam centre on the near-surface side. A brighter far wall (kappa > 1) shifts the band to the near side and narrows it)")

print("\n== 3. Tolerance needed to push the ghost band below a target width (kappa = 1) ==")
for w in (2.0, 1.0, 0.5, 0.25):
    print("  band <= %.2f beam std  needs eps/D >= %.4f" % (w, eps_for_width(w, 1.0)))

print("\n== 4. Absolute scale: eps = 0.10 m, pulses merge for D < R; ghosts per edge crossing, kappa = 1 ==")
EPS = 0.10
for R in (0.75, 2.25):
    print("  merge range R = %.2f m" % R)
    print("    D (m)   eps/D   width   ghosts/edge: q=0.5 q=1   q=2   P(edge has ghost): q=0.5 q=1   q=2")
    for D in (0.15, 0.2, 0.25, 0.4, 0.6, 0.74, 1.0, 2.0):
        if D >= R:
            print("    %-6g  resolved (two returns, first-return gives the near surface): no ghost" % D)
            continue
        e = EPS / D
        print("    %-6g  %-6.3f  %-6.3f  %-17.3f  %-5.3f %-5.3f %-17.3f %-5.3f %.3f" % (
            D, e, ghost_width(e, 1.0), *(ghosts_per_edge(e, 1.0, q) for q in (0.5, 1, 2)),
            *(p_edge_has_ghost(e, 1.0, q) for q in (0.5, 1, 2))))

print("\n== 5. Scan Monte Carlo: ghost fraction of all beams, edges about every 100 beams (jittered), 600000 beams, seed 5 ==")
print("  kappa  eps/D  q    predicted      simulated      ratio")
rng = random.Random(5)
for k, e, q in ((1.0, 0.1, 1.0), (1.0, 0.1, 3.0), (1.0, 0.02, 1.0), (10.0, 0.1, 2.0), (0.1, 0.25, 2.0)):
    pred = ghost_width(e, k) * q / 100
    sim = simulate_scan(e, k, q, 600000, rng, 100)
    print("  %-5g  %-5g  %-3g  %-13.5g  %-13.5g  %.4f" % (k, e, q, pred, sim, sim / pred))

print("\n== 6. Persistence filter: static robot, 5 scans with i.i.d. pointing jitter, flagged if ghost in >= 3 of 5 (eps/D = 0.1, kappa = 1) ==")
print("  jitter(beam std)  ghost samples  fraction that persist")
rng = random.Random(6)
for j in (0.05, 0.1, 0.3, 1.0):
    n, fr = ghost_persistence(0.1, 1.0, j, 5, 3, rng, n_beams=200000)
    print("  %-16g  %-15d  %.4f" % (j, n, fr))

print("\n== 7. Worked example: r1 = 10 m, D = 0.5 m, equal energies, beam centre at the edge (u = 0) ==")
print("  twin returns %.2f m or %.2f m; real returns %.3f m (%.3f m from each surface)" % (
    twin_range(0.01, 10, 0.5), twin_range(-0.01, 10, 0.5), merged_range(0, 10, 0.5, 1.0), merged_range(0, 10, 0.5, 1.0) - 10))
