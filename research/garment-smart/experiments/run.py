"""Experiments for garment-smart. Writes experiments/results.txt. Seeds fixed."""
import itertools, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_smart.model import SENSORS, Softmax, accuracy, make_dataset

SEEDS = range(5)
ALL = list(SENSORS)
out = []


def run(sensors, train_kw, test_kw, n=120):
    accs = []
    for s in SEEDS:
        rng = np.random.default_rng(s)
        Xa, ya, _ = make_dataset(n, rng, sensors, **train_kw)
        Xb, yb, _ = make_dataset(n, rng, sensors, **test_kw)   # fresh people
        accs.append(accuracy(Softmax().fit(Xa, ya), Xb, yb))
    return np.mean(accs), np.std(accs)


def p(s=""):
    print(s); out.append(s)


p("# garment-smart results (synthetic data; 5 seeds, 6 classes, chance = 16.7%)")
p("\n## A. Sensor subsets (noise 0.3, no slip; test on unseen simulated people)")
rows = []
for r in range(1, len(ALL) + 1):
    for sub in itertools.combinations(ALL, r):
        m, sd = run(list(sub), {}, {})
        rows.append((m, sd, sub))
for m, sd, sub in sorted(rows, key=lambda t: -t[0]):
    p(f"{m*100:5.1f} +- {sd*100:4.1f}  {'+'.join(sub)}")

p("\n## B. Noise sweep, all sensors (train and test at the same noise)")
for nz in [0.1, 0.3, 1.0, 2.0, 4.0]:
    m, sd = run(ALL, dict(noise=nz), dict(noise=nz))
    p(f"noise {nz:3.1f}: {m*100:5.1f} +- {sd*100:4.1f}")

p("\n## C. Garment slip (sim-to-sim shift): test with slip, train clean vs trained with slip")
for slip in [0.0, 0.3, 0.6, 1.0]:
    m1, s1 = run(ALL, {}, dict(slip=slip))
    m2, s2 = run(ALL, dict(slip=0.6), dict(slip=slip))
    p(f"test slip {slip:3.1f} rad: train-clean {m1*100:5.1f} +- {s1*100:4.1f} | train-slip0.6 {m2*100:5.1f} +- {s2*100:4.1f}")

p("\n## D. Slip shift, IMU-only vs strain-only (train clean, test slip 1.0)")
for name, sub in [("IMU only", ["chest_imu", "thigh_imu", "wrist_imu"]), ("strain only", ["knee_strain", "elbow_strain"])]:
    m, sd = run(sub, {}, dict(slip=1.0))
    p(f"{name:12s} {m*100:5.1f} +- {sd*100:4.1f}")

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
p("\nok")
