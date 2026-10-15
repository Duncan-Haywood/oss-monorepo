"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from slip_twin.model import (Car, steady_radius_ratio, steady_radius_sim, closed_loop_poly, charpoly, twin_poly, is_hurwitz,
                             real_stable, max_stable_speed, simulate)

US = Car()                                   # understeer: Cf = 60 kN/rad, Cr = 80 kN/rad
OS = Car(cf=80000.0, cr=50000.0)             # oversteer
print("Slip twin: real = linear single-track car with tyre slip; twin = kinematic bicycle (no slip). m=%g Iz=%g a=%g b=%g L=%g" % (US.m, US.iz, US.a, US.b, US.L))
print("understeer car Cf=%g Cr=%g: K = %.5f s^2/m, characteristic speed %.2f m/s" % (US.cf, US.cr, US.K, US.v_char()))
print("oversteer  car Cf=%g Cr=%g: K = %.5f s^2/m, critical speed %.2f m/s" % (OS.cf, OS.cr, OS.K, OS.v_crit()))

R = 100.0
print("\n== 1. Steady turn at the twin's steering angle delta = L/R, R = %g m: real radius vs twin ==" % R)
print("car         v    R_real(sim)   R_real(1+Kv^2/L)   twin error   calibrated-twin error")
for name, car, vs, T in (("understeer", US, (5, 10, 15, 20, 23.26, 30), 20.0), ("oversteer", OS, (5, 10, 15, 20), 20.0)):
    for v in vs:
        rs = steady_radius_sim(car, v, R, T=T)
        rf = R * steady_radius_ratio(car.K, car.L, v)
        print("%-10s %5.2f  %11.3f  %16.3f  %+9.1f%%   %+8.2f%%" % (name, v, rs, rf, 100 * (R - rs) / rs, 100 * (rf - rs) / rs))

print("\n== 2. Closed loop: delta = -kp y - kd psi.  Twin (kinematic): s^2 + (v kd/L) s + v^2 kp/L, Hurwitz for every v, kp, kd > 0 ==")
print("kp     kd     twin ok on v=1..60   calibrated twin ok   real max stable speed (m/s)")
grid_kp, grid_kd = (0.02, 0.05, 0.1, 0.2, 0.4, 0.8), (0.2, 0.5, 1.0, 2.0, 4.0)
vs = [1.0 + 0.5 * i for i in range(119)]
bad, total, ratios = 0, 0, []
for kp in grid_kp:
    for kd in grid_kd:
        tw = all(is_hurwitz(twin_poly(US.L, v, kp, kd)) for v in vs)
        ct = all(is_hurwitz(twin_poly(US.L, v, kp, kd, US.K)) for v in vs)
        vm = max_stable_speed(US, kp, kd, vhi=300.0)
        total += 1
        if tw and vm < 60:
            bad += 1
        print("%.2f   %.2f   %-18s   %-18s   %s" % (kp, kd, tw, ct, "no limit below 300" if math.isinf(vm) else "%.1f" % vm))
print("gain pairs certified stable at every speed 1..60 by the twin (and its calibration) but unstable below 60 m/s on the real car: %d of %d" % (bad, total))

print("\n== 3. Time-domain check of one gain pair, kp = 0.4, kd = 0.5, initial offset 1 m ==")
for v in (8.0, 20.0):
    tr = simulate(US, v, lambda t, x: -0.4 * x[0] - 0.5 * x[1], 30.0, 2e-3, x0=(1.0, 0.0, 0.0, 0.0))
    peak_late = max(abs(x[0]) for t, x in tr if t > 25)
    print("v=%4.1f  real |y| max over t in [25,30] s: %.3e   real stable (Routh): %s   twin stable: %s" % (
        v, peak_late, real_stable(US, v, 0.4, 0.5), is_hurwitz(twin_poly(US.L, v, 0.4, 0.5))))

print("\n== 4. Oversteer car: same gains kp = 0.05, kd = 0.5 ==")
print("max stable speed (real): %.1f m/s   critical speed: %.2f m/s   twin: stable at all speeds" % (max_stable_speed(OS, 0.05, 0.5, vhi=300.0), OS.v_crit()))
def lateral_block(car, v):
    A, _ = car.matrices(v)
    return [[A[2][2], A[2][3]], [A[3][2], A[3][3]]]


print("open-loop (vy, r) block Hurwitz at v = 10, 20, 30 m/s: %s" % [is_hurwitz(charpoly(lateral_block(OS, v))) for v in (10, 20, 30)])
