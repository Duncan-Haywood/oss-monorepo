"""Pre-roll ring buffer on an energy-gated pendant: onset recall, RAM and battery hours on synthetic
audio. Prints the tables quoted in the README (redirect to results.txt)."""
import numpy as np
from ambient_preroll.sim import synth, frame_ms, noise_floor, adaptive_gate, score
from ambient_preroll.preroll import sent_mask, onset_scores, onset_lag, FRAME_BYTES
from ambient_preroll.power import Params, battery_hours

P = Params()
ROOMS = [-60, -50, -40, -30]
SEEDS = range(20)
SECONDS = 120
PREROLLS = [0, 5, 10, 25, 50]          # frames of 20 ms
SETTINGS = [(4, 10), (4, 0), (8, 10), (8, 0)]   # (k, hangover frames)

data = {}
for r in ROOMS:
    data[r] = []
    for s in SEEDS:
        x, act = synth(SECONDS, r, seed=1000 * (r + 100) + s)
        ms = frame_ms(x)
        data[r].append((ms, act, noise_floor(ms, 250)))

print(f"synthetic audio: {len(SEEDS)} seeds x {SECONDS} s per room; frames are 20 ms; "
      f"pre-roll RAM = frames x {FRAME_BYTES} bytes")
print("n utterances per room:", {r: sum(len(__import__('ambient_preroll.preroll', fromlist=['x']).utterance_starts(a)) for _, a, _ in data[r]) for r in ROOMS})

for k, hang in SETTINGS:
    print(f"\n== adaptive k={k} hangover={hang}: onset-lag (frames from first speech frame to gate open), mean and share > 5 / > 10 frames")
    for r in ROOMS:
        lags = np.concatenate([onset_lag(adaptive_gate(ms, k, hang, floor=fl), act) for ms, act, fl in data[r]])
        print(f"room {r:4d}: mean {lags.mean():5.2f}  >5: {np.mean(lags > 5):.3f}  >10: {np.mean(lags > 10):.3f}  >25: {np.mean(lags > 25):.3f}")
    print(f"== adaptive k={k} hangover={hang}: per pre-roll, cells are recall / onset recall / clean-utterance share / sent / hours")
    print("preroll  RAM_KB " + "".join(f"{'['+str(r)+']':>40s}" for r in ROOMS))
    for pr in PREROLLS:
        cells = []
        for r in ROOMS:
            rows = []
            for ms, act, fl in data[r]:
                op = adaptive_gate(ms, k, hang, floor=fl)
                sm = sent_mask(op, pr)
                rec = float(sm[act].mean())
                orc, clean, _ = onset_scores(sm, act)
                rows.append((rec, orc, clean, float(sm.mean())))
            m = np.nanmean(rows, axis=0)
            cells.append(f"{m[0]:.3f}/{m[1]:.3f}/{m[2]:.3f}/{m[3]:.3f}/{battery_hours(P, m[3]):6.1f}h")
        print(f"{pr:6d} {pr * FRAME_BYTES / 1024:7.1f} " + "".join(f"{c:>40s}" for c in cells))
