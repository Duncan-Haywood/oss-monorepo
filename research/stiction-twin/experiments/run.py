"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
from stiction_twin.model import run_loop, twin_stable, tail_amplitude, max_error

KP = 10.0
N = 100000          # steps of dt = 0.01 (1000 s); tail = last 100 s

print("Stiction twin: unit mass, kinetic friction Fc, static friction Fs >= Fc; twin has no friction. PID kp=10, dt=0.01.")
print("dF = Fs - Fc; 'norm amp' = tail half peak-to-peak * kp / dF.")

print("\n== 1. Twin vs real, x0 = 1, Fc = 1 (tail of 1000 s) ==")
print("kd   ki   twin stable  Fs    twin max|x|   real max|x|   real amp   norm amp")
for kd, ki in ((1, 2), (1, 5), (4, 2), (4, 5), (0.5, 2)):
    tw = max_error(run_loop(KP, kd, ki, 0.0, 0.0, 1.0, N))
    for Fs in (1.0, 1.5, 2.0):
        xs = run_loop(KP, kd, ki, 1.0, Fs, 1.0, N)
        a, e = tail_amplitude(xs), max_error(xs)
        print("%-4g %-4g %-12s %-5g %-13.1e %-13.3e %-10.4f %s" % (kd, ki, twin_stable(KP, kd, ki), Fs, tw, e, a, "%.3f" % (a * KP / (Fs - 1)) if Fs > 1 else "-"))

print("\n== 2. Exact scaling (kd=1, ki=2, Fc=1, Fs=2, x0=0.7): max |s*x(t) - x_s(t)| / s over 20000 steps ==")
a = run_loop(KP, 1, 2, 1.0, 2.0, 0.7, 20000)
for s in (2.0 ** -7, 2.0 ** 10, 0.01, 100.0):
    b = run_loop(KP, 1, 2, s, 2 * s, 0.7 * s, 20000)
    print("s = %-10g %.1e" % (s, max(abs(x * s - y) for x, y in zip(a, b)) / s))
print("tail amp / (dF/kp) at s = 0.01, 1, 100 (x0 = 10 dF/kp * s):")
for s in (0.01, 1.0, 100.0):
    xs = run_loop(KP, 1, 2, s, 2 * s, s, N)
    print("s = %-6g %.6f" % (s, tail_amplitude(xs) * KP / s))

print("\n== 3. Time-step convergence (kd=1, ki=2, Fc=1, Fs=2, x0=1, 600 s): tail amp ==")
for dt in (0.01, 0.005, 0.0025, 0.00125):
    xs = run_loop(KP, 1, 2, 1.0, 2.0, 1.0, int(600 / dt), dt=dt)
    print("dt = %-8g %.5f" % (dt, tail_amplitude(xs)))

print("\n== 4. Dependence on Fc/dF (kd=1, ki=2, dF=1, x0=1): norm amp by start x0 ==")
print("Fc    x0=0.1   x0=1   x0=10")
for Fc in (0.0, 0.1, 0.5, 1.0, 2.0, 5.0, 20.0):
    row = []
    for x0 in (0.1, 1.0, 10.0):
        xs = run_loop(KP, 1, 2, Fc, Fc + 1.0, x0, N)
        row.append("%.3f/%.1e" % (tail_amplitude(xs) * KP, max_error(xs)))
    print("%-5g %s" % (Fc, "  ".join(row)))
print("(entries: norm amp / tail max|x|)")

print("\n== 5. Damping sweep (ki=2, Fc=1, dF=1, x0=1): norm amp ==")
for kd in (0.25, 0.5, 1, 2, 3, 4):
    xs = run_loop(KP, kd, 2, 1.0, 2.0, 1.0, N)
    print("kd = %-5g stable=%-6s norm amp %.3f" % (kd, twin_stable(KP, kd, 2), tail_amplitude(xs) * KP))
print("\nIntegral sweep (kd=1, Fc=1, dF=1, x0=1): norm amp")
for ki in (0.1, 0.5, 1, 2, 5, 9):
    xs = run_loop(KP, 1, ki, 1.0, 2.0, 1.0, N)
    print("ki = %-5g norm amp %.3f" % (ki, tail_amplitude(xs) * KP))

print("\n== 6. Pure Coulomb (Fs = Fc): does the loop converge? tail max|x| after 1000 s (x0=1) ==")
print("kd   ki    Fc=0.2    Fc=1     Fc=5")
for kd, ki in ((4, 2), (1, 2), (1, 5), (0.5, 2), (0.25, 1)):
    print("%-4g %-5g %s" % (kd, ki, "  ".join("%.1e" % max_error(run_loop(KP, kd, ki, Fc, Fc, 1.0, N)) for Fc in (0.2, 1.0, 5.0))))

print("\n== 7. Proportional-only stall band (ki=0, kd=1, Fc=1, Fs=2): final |x| vs x0 (band Fs/kp = 0.2) ==")
for x0 in (0.15, 0.25, 0.5, 1.0, 5.0):
    xs = run_loop(KP, 1, 0.0, 1.0, 2.0, x0, 20000)
    print("x0 = %-5g final x = %.4f" % (x0, xs[-1]))

print("\n== 8. Is a zero tail amplitude convergence or a long stick? (kd=1, dF=1, x0=1, 20000 s, tail = last 10%) ==")
print("ki    Fc    tail amp   tail max|x|   breakaways in tail (x changes after a stuck stretch of >= 5 s)")
for ki, Fc in ((0.1, 1.0), (2.0, 20.0), (2.0, 5.0)):
    xs = run_loop(KP, 1, ki, Fc, Fc + 1.0, 1.0, 2000000)
    t = xs[-200000:]
    runs, i, br = 0, 0, 0
    while i < len(t) - 1:
        j = i
        while j + 1 < len(t) and t[j + 1] == t[i]:
            j += 1
        if j - i >= 500 and j + 1 < len(t):
            br += 1
        i = j + 1
    print("%-5g %-5g %-10.4f %-13.2e %d" % (ki, Fc, tail_amplitude(xs), max_error(xs), br))
