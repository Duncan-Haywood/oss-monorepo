"""capture-realaudio: GCC-PHAT sync error on real clips vs synthetic source. Writes results.txt."""
import os
import numpy as np
from capture_realaudio import available_clips, error_ms, synthetic_pair_error_ms

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
TRIALS = 20            # random start + random delay per clip per cell
FRAME_MS = 1000 / 30
lines = []


def emit(s=""):
    print(s)
    lines.append(s)


clips = available_clips()
emit(f"# {len(clips)} real clips (>= 3.9 s) from the LibreOffice gallery: {' '.join(clips)}")
emit(f"# {TRIALS} trials per clip per cell, 2 s window, delay uniform in [0.2, 0.8] s; 'bad' = error > one 30 fps frame ({FRAME_MS:.1f} ms)")


def cell(clip, snr, kind, win):
    rng = np.random.default_rng(12345 + int(snr * 7) + (kind == "wind") * 99 + int(win * 10))
    return np.array([error_ms(clip, rng, rng.uniform(0.2, 0.8), win, snr, kind) for _ in range(TRIALS)])


def synth(snr, win):
    rng = np.random.default_rng(777 + int(snr * 7) + int(win * 10))
    return np.array([synthetic_pair_error_ms(rng, rng.uniform(0.2, 0.8), win, snr) for _ in range(TRIALS * 3)])


emit("\n## Share of windows more than one frame off, 2 s window, by SNR and noise type")
emit("snr_db | synthetic_white | real_white_mean | real_white_worst_clip | real_wind_mean | real_wind_worst_clip")
for snr in (-20, -15, -10, -5, 0, 10):
    s = (synth(snr, 2.0) > FRAME_MS).mean()
    rw = {n: (cell(c, snr, "white", 2.0) > FRAME_MS).mean() for n, c in clips.items()}
    rd = {n: (cell(c, snr, "wind", 2.0) > FRAME_MS).mean() for n, c in clips.items()}
    emit(f"{snr} | {s:.2f} | {np.mean(list(rw.values())):.2f} | {max(rw.values()):.2f} | "
         f"{np.mean(list(rd.values())):.2f} | {max(rd.values()):.2f}")

emit("\n## Per clip, white noise, 2 s window: share bad at -15, -10, -5 dB; median error (ms) at 0 dB")
emit("clip | bad@-15 | bad@-10 | bad@-5 | median_ms@0")
for n, c in clips.items():
    b = [(cell(c, s, "white", 2.0) > FRAME_MS).mean() for s in (-15, -10, -5)]
    m = np.median(cell(c, 0, "white", 2.0))
    emit(f"{n} | {b[0]:.2f} | {b[1]:.2f} | {b[2]:.2f} | {m:.3f}")

emit("\n## Where the delay is found, error among good windows (white, 0 dB): median and 95th percentile ms, all clips pooled")
e = np.concatenate([cell(c, 0, "white", 2.0) for c in clips.values()])
g = e[e <= FRAME_MS]
emit(f"good_share {len(g)/len(e):.3f} | median_ms {np.median(g):.3f} | p95_ms {np.percentile(g,95):.3f}")
es = synth(0, 2.0)
gs = es[es <= FRAME_MS]
emit(f"synthetic: good_share {len(gs)/len(es):.3f} | median_ms {np.median(gs):.3f} | p95_ms {np.percentile(gs,95):.3f}")
open(OUT, "w").write("\n".join(lines) + "\n")

# ---- appended section: why do some clips fail, and does partial whitening help?
emit("\n## Clip character vs failure (white noise, 2 s, -10 dB): spectral flatness in 100-4000 Hz, share of active frames, bad share for gamma 1 (PHAT), 0.5, 0")
emit("clip | flatness | active | bad_g1.0 | bad_g0.5 | bad_g0.0")
from capture_realaudio import spectral_stats
rows = []
for n, c in clips.items():
    fl, ac = spectral_stats(c)
    bs = []
    for gm in (1.0, 0.5, 0.0):
        rng = np.random.default_rng(4242)
        e = np.array([error_ms(c, rng, rng.uniform(0.2, 0.8), 2.0, -10, "white", gm) for _ in range(TRIALS)])
        bs.append((e > FRAME_MS).mean())
    rows.append((fl, ac, bs))
    emit(f"{n} | {fl:.3f} | {ac:.2f} | {bs[0]:.2f} | {bs[1]:.2f} | {bs[2]:.2f}")
emit("mean bad share over clips: " + " | ".join(f"gamma {g}: {np.mean([r[2][i] for r in rows]):.2f}" for i, g in enumerate((1.0, 0.5, 0.0))))
emit("\n## Same, all SNRs, mean over the clips (white noise, 2 s)")
emit("snr_db | g1.0 | g0.75 | g0.5 | g0.25 | g0.0")
for snr in (-15, -10, -5, 0, 10):
    out = []
    for gm in (1.0, 0.75, 0.5, 0.25, 0.0):
        vals = []
        for c in clips.values():
            rng = np.random.default_rng(99)
            e = np.array([error_ms(c, rng, rng.uniform(0.2, 0.8), 2.0, snr, "white", gm) for _ in range(TRIALS)])
            vals.append((e > FRAME_MS).mean())
        out.append(f"{np.mean(vals):.2f}")
    emit(f"{snr} | " + " | ".join(out))
open(OUT, "w").write("\n".join(lines) + "\n")
