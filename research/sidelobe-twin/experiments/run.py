"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from sidelobe_twin.model import (ENBW, resp, db, peak_sidelobe, width_3db, marcum_sf, thresh_power, amp, ghost_pfa,
                                 ghost_free_snr_db, ghost_zone_radius, pd_twin, pd_real)

WS = ("rect", "hann", "hamming")
PFA0 = 1e-6

print("Sidelobe twin: real = matched-filter output with window response rho_w(x) (x in resolution cells); twin = ideal point response (no sidelobes)")
print("cell noise CN(0,1); threshold T^2 = -ln(Pfa0), Pfa0 = %g; strong-target SNR S is the raw SNR before the taper's ENBW loss" % PFA0)

print("\n== 1. Window facts (computed from the closed-form responses) ==")
print("  window    peak sidelobe (dB)   at x      3 dB width (cells)   ENBW (dB)   width / rect")
w0 = width_3db("rect")
PK = {}
for w in WS:
    p, x = peak_sidelobe(w)
    PK[w] = x
    print("  %-8s   %8.2f          %5.2f      %.3f                %.2f        %.2f" % (w, db(p * p), x, width_3db(w), db(ENBW[w]), width_3db(w) / w0))

print("\n== 2. Ghost false alarm at the peak sidelobe, no weak target present; twin says Pfa0 = %g ==" % PFA0)
print("  S (dB)   rect          hann          hamming")
for s in (10, 20, 30, 40, 50, 60):
    print("  %4d    %-12.3g  %-12.3g  %-12.3g" % ((s,) + tuple(ghost_pfa(w, s, PK[w], PFA0) for w in WS)))

print("\n== 3. Ghost-free dynamic range: largest strong-target SNR whose peak-sidelobe ghost stays at or below Pfa_max ==")
print("  Pfa_max     rect (dB)   hann (dB)   hamming (dB)   (gain over rect, dB: hann / hamming)")
for pm in (1e-5, 1e-4, 1e-3, 1e-2):
    v = [ghost_free_snr_db(w, PK[w], pm, PFA0) for w in WS]
    print("  %-8g    %6.2f      %6.2f      %6.2f          %5.2f / %5.2f" % (pm, v[0], v[1], v[2], v[1] - v[0], v[2] - v[0]))

print("\n== 4. Ghost zone radius: smallest offset (cells) beyond which no lobe gives ghost Pfa > 1e-4 ==")
print("  S (dB)   rect    hann    hamming    rect radius / rect radius 10 dB lower (sqrt(10) = 3.16 if it scales as sqrt(S))")
prev = None
for s in (20, 30, 40, 50, 60):
    r = [ghost_zone_radius(w, s, 1e-4, PFA0) for w in WS]
    print("  %4d    %4d    %4d    %4d       %s" % (s, r[0], r[1], r[2], "%.2f" % (r[0] / prev) if prev else "-"))
    prev = r[0]

print("\n== 5. Weak target (SNR 13 dB) behind a strong one (S = 40 dB) at offset x: twin vs real, uniform phase ==")
print("  twin Pd (rect / hann / hamming, the taper's ENBW loss included) = %.3f / %.3f / %.3f; twin Pfa = %g" % (
    tuple(pd_twin(w, 13, PFA0) for w in WS) + (PFA0,)))
print("  window    x      rho(x)     real Pd    real Pfa (no weak)   Pd - Pfa")
for w in WS:
    for x in (PK[w], 5.5, 10.5, 25.5):
        pd = pd_real(w, 40, 13, x, PFA0)
        pf = ghost_pfa(w, 40, x, PFA0)
        print("  %-8s %5.2f  %+8.4f   %.4f     %-12.3g        %.4f" % (w, x, resp(w, x), pd, pf, pd - pf))

print("\n== 6. Same, strong target S = 25 dB: leakage moves the weak target's Pd both ways and still creates ghosts at rect's first lobes ==")
print("  twin Pd (rect / hann / hamming) = %.3f / %.3f / %.3f" % tuple(pd_twin(w, 13, PFA0) for w in WS))
print("  window    x      rho(x)     real Pd    real Pfa (no weak)")
for w in WS:
    for x in (PK[w], 5.5, 10.5):
        print("  %-8s %5.2f  %+8.4f   %.4f     %-12.3g" % (w, x, resp(w, x), pd_real(w, 25, 13, x, PFA0), ghost_pfa(w, 25, x, PFA0)))

print("\n== 7. Monte Carlo cross-check of the closed-form Marcum computation (200000 draws) ==")
rng = random.Random(11)
n = 200000
print("  nu     T^2     exact       sim")
for nu, t2 in ((1.0, 6.0), (3.0, 13.8), (4.0, 13.8), (6.0, 13.8)):
    c = sum(abs(complex(nu + rng.gauss(0, math.sqrt(.5)), rng.gauss(0, math.sqrt(.5)))) ** 2 > t2 for _ in range(n))
    print("  %.1f   %5.1f    %.5f     %.5f" % (nu, t2, marcum_sf(nu, t2), c / n))
