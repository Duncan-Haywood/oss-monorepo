"""Sweep: drift rate (% of distance) over heading bias x DVL scale; distance to a 10 m bound."""
import math, statistics
from marine_dr.dr import analytic_rate, run_straight, distance_to_bound

SCALES = [0.0006, 0.001, 0.002, 0.004]
BIAS_DEG = [0.05, 0.1, 0.2, 0.5, 1.0]
print("drift rate, % of distance travelled (analytic) | simulated end error on 10 km, m")
print("bias_deg " + " ".join(f"s={s*100:.2f}%".rjust(18) for s in SCALES))
for b in BIAS_DEG:
    row = []
    for s in SCALES:
        br = math.radians(b)
        a = analytic_rate(s, br) * 100
        e, _ = run_straight(10000, scale=s, bias_rad=br)
        row.append(f"{a:6.3f}% | {e:7.1f} m")
    print(f"{b:8.2f} " + " ".join(r.rjust(18) for r in row))

print("\nkm of travel before a 10 m bound is reached (analytic)")
for b in BIAS_DEG:
    print(f"{b:6.2f} deg: " + "  ".join(f"{distance_to_bound(10, s, math.radians(b))/1000:6.2f}" for s in SCALES))

print("\nMonte Carlo, 20 km, scale ~ N(0, 0.2%), bias ~ N(0, 0.1 deg), gyro RW 5e-5 rad/sqrt(s), "
      "vel noise 0.3 cm/s per 1 s ping, 200 runs; fix sd 3 m")
import random
rng = random.Random(1)
for fix in [None, 10000, 5000, 2000, 1000, 500]:
    maxes = []
    for i in range(200):
        s = rng.gauss(0, 0.002); b = math.radians(rng.gauss(0, 0.1))
        _, m = run_straight(20000, scale=s, bias_rad=b, vel_sigma=0.003, heading_rw_rad_sqrt_s=5e-5,
                            seed=i, fix_every_m=fix, fix_sigma_m=3.0)
        maxes.append(m)
    maxes.sort()
    lab = "no fix" if fix is None else f"fix {fix/1000:g} km"
    print(f"{lab:10s} median max-err {statistics.median(maxes):7.1f} m   95th {maxes[int(.95*len(maxes))]:7.1f} m")
