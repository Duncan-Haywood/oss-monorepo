"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from blur_twin.model import (profile, profile_sim, peak, pixels, box_output, detect_prob, qinv, mc_detect,
                             speed_limit_peak, speed_limit_box, box_output_len_d, speed_limit_box_len_d)

ALPHA, PD, T = 1e-3, 0.9, 0.010
print("Blur twin: real = exposure T=%g s (smear d = v T px), twin = instantaneous (d = 0). Bar width w px, contrast C, pixel noise sigma." % T)
print("Detection: known location, false-alarm rate alpha=%g on noise alone, target Pd=%g." % (ALPHA, PD))


def outputs(w, d, c):
    """(peak pixel, best integer-length box, box of length round(w+d)+1, box of fixed length round(w)) at pixel phase 0, noiseless."""
    v = pixels(float(w), float(d), c, hi=int(w + d) + 8)
    best = max((box_output(v, L), L) for L in range(1, int(w + d) + 6))
    return max(v), best, box_output(v, int(round(w + d)) + 1), box_output(v, int(round(w)))


print("\n== 1. Profile: closed form vs 2000-sub-exposure forward simulation ==")
worst = 0.0
for w, d in ((6, 3), (6, 6), (6, 20), (2, 40), (6, 60)):
    for i in range(-20, int(w + d) + 20):
        x = i * 0.37
        worst = max(worst, abs(profile(x, w, d) - profile_sim(x, w, d)))
print("max |closed form - simulation| over 5 (w, d) pairs and ~600 points = %.2e (quantisation bound 1/2000 = 5.0e-04)" % worst)

print("\n== 2. Peak height and energy (w = 6, C = 1): peak = min(1, w/d), plateau |d - w|, base w + d, energy C w conserved ==")
print("    d   peak (grid max)   min(1,w/d)   energy (sum*dx)")
for d in (0, 3, 6, 12, 30, 60):
    xs = [i * 0.005 - 5 for i in range(int((6 + d + 10) / 0.005))]
    ps = [profile(x, 6.0, float(d)) for x in xs]
    print("%5d   %14.4f   %10.4f   %14.4f" % (d, max(ps), peak(6.0, d), sum(ps) * 0.005))

print("\n== 3. Detection power vs smear d (w = 6, C/sigma = 10): twin certifies Pd = 1 at every speed ==")
print("(mean outputs in units of sigma; Pd from the Gaussian formula, MC = 20000 noise draws; 'fixed' box = length round(w), i.e. tuned on the twin)")
print("    d   v px/s   peak: out  Pd (MC)        matched box: out  Pd (MC)      fixed box: out  Pd (MC)    twin Pd")
rng = random.Random(3)
c, w = 10.0, 6
for d in (0, 6, 12, 24, 36, 48, 60):
    pk, (bb, bl), bm, bf = outputs(w, d, c)
    tw = detect_prob(outputs(w, 0, c)[0], 1.0, ALPHA)
    row = []
    for o in (pk, bb, bf):
        row.append("%5.2f  %.3f (%.3f)" % (o, detect_prob(o, 1.0, ALPHA), mc_detect(o, 1.0, ALPHA, 20000, rng)))
    print("%5d   %6.0f   %s   %s   %s   %.3f" % (d, d / T, row[0], row[1], row[2], tw))

print("\n== 4. Speed limits for Pd >= 0.9 at alpha=1e-3 (largest smear d); closed form vs numeric bisection on pixel outputs ==")
print("closed forms: peak d* = w C/(sigma z); full box d* = (w C/(sigma z))^2 - w; box of length d: solve C w (1 - w/(4d))/sqrt(d) = sigma z;")
print("z = Q^-1(alpha) - Q^-1(Pd) = %.3f. numeric: peak = max pixel (phase 0); box = best of L in {round(d)-3..round(d)+3, round(w+d)+1}" % (qinv(ALPHA) - qinv(PD)))


def num_limit(f, lo, hi):
    """Largest d in [lo, hi] with f(d) true, assuming f is true then false (bisection, 60 steps)."""
    if not f(lo):
        return None
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if f(mid):
            lo = mid
        else:
            hi = mid
    return lo


def box_best(w, d, c):
    v = pixels(float(w), float(d), c, hi=int(w + d) + 8)
    r = int(round(d))
    return max(box_output(v, L) for L in list(range(max(1, r - 3), r + 4)) + [int(round(w + d)) + 1])


print("  w   C/sigma   peak cf   peak num   full-box cf   len-d cf   box num   speed gain num (box/peak)   peak limit px/s   box limit px/s")
for w in (3, 6, 12):
    for c in (8.0, 10.0, 15.0, 20.0):
        dpk = speed_limit_peak(w, c, 1.0, ALPHA, PD)
        dfb = speed_limit_box(w, c, 1.0, ALPHA, PD)
        dld = speed_limit_box_len_d(w, c, 1.0, ALPHA, PD)
        npk = num_limit(lambda d: detect_prob(max(pixels(float(w), d, c, hi=int(w + d) + 8)), 1.0, ALPHA) >= PD, 0.5, 200.0)
        nbx = num_limit(lambda d: detect_prob(box_best(w, d, c), 1.0, ALPHA) >= PD, float(w), 20000.0)
        print("%3d   %6.0f   %7.2f   %8.2f   %11.2f   %8.2f   %7.2f   %23.2fx   %15.0f   %14.0f" % (
            w, c, dpk, npk, dfb, dld, nbx, nbx / npk, npk / T, nbx / T))

print("\n== 5. Best integer box length vs smear (w = 6, C/sigma = 10): numeric argmax over all L vs closed form for L = d ==")
print("    d   best L   output at best L   output at L = d   closed form C w/sqrt(d) (1 - w/(4d))   output at L = w+d   C w/sqrt(w+d)")
for d in (6, 9, 12, 24, 48):
    v = pixels(6.0, float(d), 10.0, hi=6 + d + 8)
    bo, bl = max((box_output(v, L), L) for L in range(1, 6 + d + 6))
    print("%5d   %6d   %16.3f   %15.3f   %36.3f   %17.3f   %13.3f" % (d, bl, bo, box_output(v, d), box_output_len_d(6, d, 10.0),
          box_output(v, 6 + d), 60.0 / math.sqrt(6 + d)))
