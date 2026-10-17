"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from cfar_family_twin import *

N, K75 = 16, 12
NS = 300000
SNR_DB = (15, 20, 25)
S_LIST = tuple(10 ** (d / 10) for d in SNR_DB)
print("N=%d reference cells, twin = Gaussian clutter, real = independent gamma texture (shape nu) per cell; %d windows per estimate" % (N, NS))
print("Test cell integrated out analytically (Rao-Blackwell); '+-' is one standard error of the Monte Carlo mean.")

twin = ref_stats(math.inf, N, NS, 100)          # calibration windows for the twin
twin_eval = ref_stats(math.inf, N, NS, 101)     # independent windows for checking calibration
print("\n== 1. Twin calibration (design Pfa 1e-2, 1e-4) ==")
print("detector  design  alpha_twin  twin Pfa on independent windows  exact-formula alpha")
alpha_twin = {}
for pf in (1e-2, 1e-4):
    for d in DETECTORS:
        a = calibrate(pf, twin[d], twin_pfa)
        alpha_twin[d, pf] = a
        ex = {"CA": ca_twin_alpha(pf, N), "OS75": os_twin_alpha(pf, N, K75), "OS50": os_twin_alpha(pf, N, N // 2)}.get(d)
        m, se = twin_pfa(a, twin_eval[d])
        print("%-8s  %-6g  %-10.3f  %.3e +- %.1e            %s" % (d, pf, a, m, se, "%.3f" % ex if ex else "-"))
print("(CA and OS thresholds also come out of exact formulas; LOG has none, so its twin threshold is Monte Carlo only.)")

print("\n== 2. Direct-simulation check of the Rao-Blackwell estimate (design 1e-2, 400k trials, test cell simulated) ==")
tabs = {nu: TextureTables(nu, S_LIST) for nu in (2.0, 5.0, 20.0)}
real = {nu: ref_stats(nu, N, NS, 200 + int(nu)) for nu in tabs}
for nu in (2.0, 5.0):
    for d in ("OS75", "LOG"):
        a = alpha_twin[d, 1e-2]
        mc = simulate_direct(d, a, N, nu, 400000, 7)
        m, se = real_pfa(a, real[nu][d], tabs[nu])
        print("nu=%d %-5s direct MC %.4f   Rao-Blackwell %.4f +- %.4f" % (nu, d, mc, m, se))

print("\n== 3. Real Pfa when the threshold is set in the Gaussian twin (inflation = real / design) ==")
print("design  nu    " + "".join("%-22s" % d for d in DETECTORS))
for pf in (1e-2, 1e-4):
    for nu in (2.0, 5.0, 20.0):
        row = []
        for d in DETECTORS:
            m, se = real_pfa(alpha_twin[d, pf], real[nu][d], tabs[nu])
            row.append("%.2fx (+-%.0f%%)" % (m / pf, 100 * se / m))
        print("%-6g  %-4g  " % (pf, nu) + "".join("%-22s" % r for r in row))

print("\n== 4. Repair: threshold multiplier that restores the design Pfa in real clutter (calibrated on independent windows) ==")
print("design  nu    detector  alpha_real/alpha_twin  extra dB   Pfa check on other windows")
real_eval = {nu: ref_stats(nu, N, NS, 300 + int(nu)) for nu in tabs}
repair = {}
for pf in (1e-2, 1e-4):
    for nu in (2.0, 5.0, 20.0):
        for d in DETECTORS:
            fn = lambda a, S, t=tabs[nu]: real_pfa(a, S, t)
            ar = calibrate(pf, real[nu][d], fn)
            repair[d, pf, nu] = ar
            m, se = real_pfa(ar, real_eval[nu][d], tabs[nu])
            r = ar / alpha_twin[d, pf]
            print("%-6g  %-4g  %-8s  %-21.3f  %-8.2f   %.2e +- %.0e" % (pf, nu, d, r, 10 * math.log10(r), m, se))

print("\n== 5. Detection at equal *real* Pfa = 1e-4 (repaired thresholds), Rayleigh target, mean power over clutter mean ==")
print("nu    SNR dB  " + "".join("%-9s" % d for d in DETECTORS) + " | twin promise at design threshold in Gaussian clutter")
for nu in (2.0, 5.0, 20.0):
    for db, s in zip(SNR_DB, S_LIST):
        pds = [real_pd(repair[d, 1e-4, nu], real_eval[nu][d], tabs[nu], s) for d in DETECTORS]
        prom = [twin_pd(alpha_twin[d, 1e-4], twin_eval[d], s) for d in DETECTORS]
        print("%-4g  %-6d  " % (nu, db) + "".join("%-9.4f" % p for p in pds) + " | " + " ".join("%.4f" % p for p in prom))

print("\n== 6. Same comparison but in the twin itself (Gaussian clutter, design Pfa 1e-4): the CFAR loss the twin sees ==")
print("SNR dB  " + "".join("%-9s" % d for d in DETECTORS))
for db, s in zip(SNR_DB, S_LIST):
    print("%-6d  " % db + "".join("%-9.4f" % twin_pd(alpha_twin[d, 1e-4], twin_eval[d], s) for d in DETECTORS))

print("\n== 7. Direct check of the Pd Rao-Blackwell table (nu=5, SNR 20 dB, repaired CA and LOG thresholds, 400k trials) ==")
for d in ("CA", "LOG"):
    a = repair[d, 1e-4, 5.0]
    print("%-4s direct MC %.4f   table %.4f" % (d, simulate_direct(d, a, N, 5.0, 400000, 9, s=S_LIST[1]), real_pd(a, real_eval[5.0][d], tabs[5.0], S_LIST[1])))

print("\n== 8. Known-scale oracle: no window noise at all, fixed threshold T = -ln(design) on clutter of known unit mean ==")
print("Reference cells are independent of the test cell's texture, so a better scale estimate cannot track it. Note the oracle's threshold (-ln design) is below the CA twin threshold (alpha_twin x window mean), so it is a comparison, not a bound.")
print("design  nu    oracle real Pfa   inflation x   (CA window inflation from section 3)")
for pf in (1e-2, 1e-4):
    for nu in (2.0, 5.0, 20.0):
        h = tabs[nu].hfun(-math.log(pf))
        ca = real_pfa(alpha_twin["CA", pf], real[nu]["CA"], tabs[nu])[0] / pf
        print("%-6g  %-4g  %-16.3e  %-12.2f  %.2f" % (pf, nu, h, h / pf, ca))
