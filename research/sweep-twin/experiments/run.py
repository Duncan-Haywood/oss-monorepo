"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from sweep_twin.model import (Room, Lidar, scan, snapshot, naive_points, deskew_points, fan, tilt, wall_x, naive_wall_x,
                              tilt_first_order, length_bias, converge_angle, velocity_from_converge, bearing_bias,
                              landmark_azimuth, odometry_velocity, cast)

R, L = Room(), Lidar()
DEG = 180 / math.pi
print("Sweep twin: real = 2-D lidar sweeping while the platform moves; twin = snapshot scan (all beams at t=0).")
print("room: front wall x=+%g, back wall x=-%g, side walls y=+-%g; sensor %g Hz, %d beams/rev, seam on a side wall" % (R.d1, R.d2, R.w, 1 / L.tau, L.n))


def walls(sc):
    nv = naive_points(sc)
    f, b = fan(sc, 0.0, 0.3), fan(sc, math.pi, 0.3)
    return nv, f, b


print("\n== 1. Naive placement at v=10 m/s along x (twin predicts every wall at its true position) ==")
v = 10.0
sc = scan(R, L, v)
nv, f, b = walls(sc)
xf, xb = wall_x(nv, f), wall_x(nv, b)
print("front wall mean x: %.4f (true %.1f, shift %.4f = -v*tau/4 = %.4f)" % (xf, R.d1, xf - R.d1, -v * L.tau / 4))
print("back wall mean x: %.4f (true %.1f, shift %.4f = -v*3tau/4 = %.4f)" % (xb, -R.d2, xb + R.d2, -v * 3 * L.tau / 4))
print("apparent room length %.4f vs true %.1f: bias %.4f m; closed form v*tau/2 = %.4f m" % (xf - xb, R.d1 + R.d2, (xf - xb) - (R.d1 + R.d2), length_bias(L, v)))
sides = [k for k, (_, phi, _) in enumerate(sc) if abs(phi - math.pi / 2) < 0.3]
ys = [nv[k][1] for k in sides]
print("side wall y (parallel to motion) spread: max |y - w| = %.2e m (width unbiased)" % max(abs(y - R.w) for y in ys))
dp = deskew_points(sc, v)
print("deskew with the true v: max front-wall error %.2e m, max back-wall error %.2e m" % (max(abs(dp[k][0] - R.d1) for k in f), max(abs(dp[k][0] + R.d2) for k in b)))
max_err = max(abs(naive_points(sc)[k][0] - naive_wall_x(R, L, v, sc[k][1], True)) for k in f)
print("naive front x vs closed form d1 - v t(phi), max |diff| over fan: %.2e m" % max_err)

print("\n== 2. Wall tilt and convergence (TLS fit over +-0.3 rad fans) ==")
print("v (m/s)  tau (s)   front tilt (deg)  first order   back tilt (deg)  first order   converge (deg)  first order")
for tau in (0.1, 0.05):
    lid = Lidar(tau=tau)
    for v in (1.0, 5.0, 10.0, 20.0):
        s = scan(R, lid, v)
        nv_, f_, b_ = walls(s)
        tf, tb = tilt([nv_[k] for k in f_]), tilt([nv_[k] for k in b_])
        print("%7.1f  %7.2f   %16.4f  %11.4f   %15.4f  %11.4f   %14.4f  %11.4f" % (
            v, tau, tf * DEG, tilt_first_order(R, lid, v) * DEG, tb * DEG, tilt_first_order(R, lid, v, False) * DEG,
            (tb - tf) * DEG, converge_angle(R, lid, v) * DEG))
rev = Lidar(spin=-1, phi0=math.pi / 2)
s = scan(R, rev, 10.0)
nv_, f_, b_ = walls(s)
print("clockwise spin at v=10 (phi0=+pi/2, seam on a side wall): front tilt %.4f deg, converge %.4f deg (counter-clockwise: %.4f, %.4f)" % (
    tilt([nv_[k] for k in f_]) * DEG, (tilt([nv_[k] for k in b_]) - tilt([nv_[k] for k in f_])) * DEG,
    tilt([nv[k] for k in f]) * DEG, (tilt([nv[k] for k in b]) - tilt([nv[k] for k in f])) * DEG))
s2 = scan(R, L, -10.0)
nv2, f2, b2 = walls(s2)
print("reversing the platform (v=-10) flips the sign (magnitude differs because the wall is then at a different range): front tilt %.4f deg" % (tilt([nv2[k] for k in f2]) * DEG))

print("\n== 3. What one scan reveals: velocity from the convergence angle, theta_c -> v = 2 pi theta_c / (tau (1/d1+1/d2)) ==")
print("range noise 1 cm, 200 trials per row, seeded; d1, d2 taken from the scan's own wall means")
print("true v   mean v_hat   std v_hat   relative bias of the first-order inversion")
rng = random.Random(0)
for v in (0.0, 1.0, 5.0, 10.0, 20.0):
    est = []
    for _ in range(200):
        s = scan(R, L, v, sigma=0.01, rng=rng)
        nv_, f_, b_ = walls(s)
        th = tilt([nv_[k] for k in b_]) - tilt([nv_[k] for k in f_])
        d1, d2 = wall_x(nv_, f_), -wall_x(nv_, b_)
        est.append(velocity_from_converge(Room(d1, d2, R.w), L, th))
    m = sum(est) / len(est)
    sd = math.sqrt(sum((e - m) ** 2 for e in est) / (len(est) - 1))
    print("%6.1f   %10.3f   %9.3f   %s" % (v, m, sd, ("%+.1f%%" % (100 * (m - v) / v)) if v else "n/a (mean %+.3f m/s)" % m))

print("\n== 4. Yaw during the sweep: bearing bias of a landmark (phi0 = 0 scan, spin +1, tau = 0.1 s) ==")
print("omega (rad/s)  beta (deg)  actual azimuth (deg)  bias (deg, bisection)  closed form -k beta/(1+k)")
for om in (0.5, 1.0, 2.0):
    for beta in (math.pi / 2, math.pi):
        a_ = landmark_azimuth(L, om, beta)
        print("%13.1f  %10.1f  %20.4f  %21.4f  %25.4f" % (om, beta * DEG, a_ * DEG, (a_ - beta) * DEG, bearing_bias(L, om, beta) * DEG))

print("\n== 5. Constant acceleration: front-wall odometry from consecutive naive scans ==")
print("v0 (m/s)  a (m/s^2)   v_hat     true mean v over [0,tau]   bias      a*t_f (t_f = tau/4)")
for v0, a in ((5.0, 0.0), (5.0, 2.0), (5.0, -3.0), (0.0, 5.0)):
    vh = odometry_velocity(R, L, v0, a)
    tm = v0 + a * L.tau / 2
    print("%8.1f  %10.1f   %6.3f   %22.3f   %7.4f   %7.4f" % (v0, a, vh, tm, vh - tm, a * L.tau / 4))
vs = 0.0
print("summing per-scan displacements telescopes to X(T+t_f) - X(t_f) - [X(T) - X(0)] = (v_end - v_start) t_f: bounded, does not accumulate (0 -> 10 m/s: %.3f m; arithmetic from the derivation, not a simulation)" % (10.0 * L.tau / 4))

print("\n== 6. Speed limits for a twin-certified length tolerance: v_max = 2 tol/tau, each checked by simulating the scan there ==")
print("tol (m)   tau (s)   v_max (m/s)   simulated length bias (m)")
for tol in (0.01, 0.02, 0.05):
    for tau in (0.1, 0.05, 0.025):
        vm = 2 * tol / tau
        lid = Lidar(tau=tau)
        s_ = scan(R, lid, vm)
        nv_, f_, b_ = walls(s_)
        print("%7.2f   %7.3f   %11.2f   %25.5f" % (tol, tau, vm, wall_x(nv_, f_) - wall_x(nv_, b_) - (R.d1 + R.d2)))
