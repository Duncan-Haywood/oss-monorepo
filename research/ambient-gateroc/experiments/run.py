"""Fixed vs adaptive energy gate on synthetic audio: recall, open fraction and battery hours.
Prints the tables quoted in the README (redirect to results.txt)."""
import numpy as np
from ambient_gateroc.sim import (synth, frame_ms, dbfs_to_ms, fixed_gate, adaptive_gate, noise_floor,
                                 score)
from ambient_gateroc.power import Params, battery_hours

P = Params()
ROOMS = [-60, -50, -40, -30]          # background rms, dBFS
SEEDS = range(20)
SECONDS = 120
HANG = 10                              # 200 ms
FIXED_DB = list(range(-62, -20, 4))    # threshold as rms dBFS
KS = [2, 3, 4, 6, 8, 12]

data = {}                              # room -> list of (ms, active, floor)
for r in ROOMS:
    data[r] = []
    for s in SEEDS:
        x, act = synth(SECONDS, r, seed=1000 * (r + 100) + s)
        ms = frame_ms(x)
        data[r].append((ms, act, noise_floor(ms, 250)))


def run(gate_fn, hang=HANG):
    """-> {room: (recall, open, wasted, hours)} means over seeds."""
    out = {}
    for r in ROOMS:
        sc = np.array([score(gate_fn(ms, fl, hang), act) for ms, act, fl in data[r]])
        m = np.nanmean(sc, axis=0)
        out[r] = (*m, battery_hours(P, m[1]))
    return out


print(f"synthetic audio: {len(SEEDS)} seeds x {SECONDS} s per room; hangover {HANG} frames (20 ms each)")
act_share = np.mean([a.mean() for r in ROOMS for _, a, _ in data[r]])
print(f"active-speech share of frames: {act_share:.3f}")
print("speech rms uniform in [-36, -20] dBFS per utterance; background rooms (dBFS rms):", ROOMS)
print(f"reference hours: always_stream (open=1) {battery_hours(P, 1.0):.1f}, "
      f"perfect gate (open=active share) {battery_hours(P, act_share):.1f}, "
      f"closed always {battery_hours(P, 0.0):.1f}")

print("\n== fixed threshold (rms dBFS): recall / open fraction / wasted / hours, per room ==")
fixed = {}
for d in FIXED_DB:
    thr = dbfs_to_ms(d)
    fixed[d] = run(lambda ms, fl, h, thr=thr: fixed_gate(ms, thr, h))
    print(f"thr {d:>4}:  " + "  ".join(
        f"[{r}] {v[0]:.2f}/{v[1]:.2f}/{v[2]:.2f}/{v[3]:5.1f}h" for r, v in fixed[d].items()))

print("\n== adaptive threshold (k x 5 s running-min floor) ==")
adapt = {}
for k in KS:
    adapt[k] = run(lambda ms, fl, h, k=k: adaptive_gate(ms, k, h, floor=fl))
    print(f"k {k:>3}:  " + "  ".join(
        f"[{r}] {v[0]:.2f}/{v[1]:.2f}/{v[2]:.2f}/{v[3]:5.1f}h" for r, v in adapt[k].items()))

print("\n== one setting for every room: worst-room recall and mean hours over rooms ==")
for name, tab in [("fixed", fixed), ("adaptive", adapt)]:
    for key, res in tab.items():
        rec = [v[0] for v in res.values()]
        hrs = [v[3] for v in res.values()]
        print(f"{name:<8} {key:>4}: worst recall {min(rec):.2f}  mean recall {np.mean(rec):.2f}  "
              f"mean hours {np.mean(hrs):5.1f}  worst hours {min(hrs):5.1f}")

print("\n== best fixed threshold per room if the room were known (recall >= 0.90, max hours) ==")
for r in ROOMS:
    ok = [(fixed[d][r][3], d, fixed[d][r][0]) for d in FIXED_DB if fixed[d][r][0] >= 0.90]
    print(f"room {r}: " + (f"thr {max(ok)[1]} dBFS, recall {max(ok)[2]:.2f}, {max(ok)[0]:.1f} h" if ok
                          else "no fixed threshold reaches recall 0.90"))
print("== best adaptive k per room (recall >= 0.90, max hours) ==")
for r in ROOMS:
    ok = [(adapt[k][r][3], k, adapt[k][r][0]) for k in KS if adapt[k][r][0] >= 0.90]
    print(f"room {r}: " + (f"k {max(ok)[1]}, recall {max(ok)[2]:.2f}, {max(ok)[0]:.1f} h" if ok
                          else "no k reaches recall 0.90"))

print("\n== hangover (frames) at adaptive k=4 ==")
for h in [0, 5, 10, 25, 50]:
    res = run(lambda ms, fl, hh, k=4: adaptive_gate(ms, k, hh, floor=fl), hang=h)
    print(f"hangover {h:>2}:  " + "  ".join(
        f"[{r}] {v[0]:.2f}/{v[1]:.2f}/{v[3]:5.1f}h" for r, v in res.items()))
