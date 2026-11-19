"""Step 3k, post hoc (written after the fit showed no DRR or floor reproduces the phones): where in frequency is a
2 s window's power, on the real phones and in the twin?

    python experiments/real-devices/twinband.py <LibriWASN root> <MS-SNSD root>

White noise is scaled to a window's *total* power, but GCC only uses 100-4000 Hz (`sync.gcc_curve`). If a real
phone's window holds much of its power below 100 Hz (handling, air handling, mains) or its speech band is
tilted differently from the twin's, the same nominal -10 dB is a lower in-band SNR on the phone. This script
measures, for 2 s windows at seeded random times, the share of power below 100 Hz, in 100-4000 Hz and above
4000 Hz, and the in-band tilt (power in 1-4 kHz over 100 Hz-1 kHz), on every phone of every session and on the
twin (step 3h's room: MS-SNSD speech through `rir`, DRR 0 dB). Descriptive only; no failure label is read.
"""
import importlib.util
import json
import os
import sys

import numpy as np
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gate"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
_spec = importlib.util.spec_from_file_location("step1_run", os.path.join(HERE, "run.py"))
S1 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S1)
import noisetype as NT  # noqa: E402
from capture_sync.sync import FS  # noqa: E402

N = int(2.0 * FS)
EDGES = [0.0, 100.0, 1000.0, 4000.0, FS / 2 + 1]


def bands(w):
    """Shares of the window's (mean-removed) power in [0,100), [100,1000), [1000,4000), [4000, fs/2]."""
    w = w - w.mean()
    p = np.abs(np.fft.rfft(w)) ** 2
    f = np.fft.rfftfreq(len(w), 1 / FS)
    e = np.array([p[(f >= lo) & (f < hi)].sum() for lo, hi in zip(EDGES[:-1], EDGES[1:])])
    return e / max(e.sum(), 1e-30)


def summarise(b):
    b = np.asarray(b)
    inband = b[:, 1] + b[:, 2]
    q = lambda x: [float(v) for v in np.percentile(x, [5, 50, 95])]  # noqa: E731
    return {"n": len(b), "below100": q(b[:, 0]), "inband": q(inband), "above4k": q(b[:, 3]),
            "tilt_db": q(10 * np.log10(b[:, 2] / np.maximum(b[:, 1], 1e-30))),
            "inband_loss_db": q(-10 * np.log10(inband))}


def main(lw_root, ms_root):
    rng = np.random.default_rng(3011)
    out = {"real": {}, "twin": {}}
    for room in S1.ROOMS:
        per_phone = {p: [] for p in S1.PHONES}
        for _, paths in S1.sessions(lw_root, room):
            for p in S1.PHONES:
                x = S1.load(paths[p])
                for t in rng.uniform(2.0, len(x) / FS - 4.0, 40):
                    i = int(t * FS)
                    per_phone[p].append(bands(x[i:i + N]))
        out["real"][room] = {p: summarise(v) for p, v in per_phone.items()}
        out["real"][room]["all"] = summarise([r for v in per_phone.values() for r in v])
    blocks = NT.speech_blocks(ms_root)
    for room, rt in (("200", 0.2), ("800", 0.8)):
        rows = []
        for k in range(400):
            sp = blocks[k % NT.N_SESS]
            i = int(rng.integers(0, len(sp) - N - int(rt * FS)))
            y = fftconvolve(sp[i:i + N + int(rt * FS)], NT.rir(rt, rng))[int(rt * FS):int(rt * FS) + N]
            rows.append(bands(y))
        out["twin"][room] = summarise(rows)
    lines = ["capture-sync step 3k, post hoc: power by band in 2 s windows (median [5th, 95th]), real phones and twin",
             "in-band = 100-4000 Hz, the band GCC uses. White noise is 48.75% in-band, so white noise added at a nominal",
             "SNR sits in-band at nominal + 10 log10(in-band share / 0.4875); in-band loss = -10 log10(in-band share)", ""]
    fmt = lambda q, s=1: f"{s * q[1]:.3f} [{s * q[0]:.3f}, {s * q[2]:.3f}]"  # noqa: E731
    for room in S1.ROOMS:
        for name, v in [(p, out["real"][room][p]) for p in S1.PHONES + ["all"]] + [("TWIN", out["twin"][room])]:
            lines.append(f"  room {room} {name:8s} below 100 Hz {fmt(v['below100'])}  in-band {fmt(v['inband'])}  "
                         f"above 4 kHz {fmt(v['above4k'])}  tilt {v['tilt_db'][1]:+.1f} dB  in-band loss "
                         f"{v['inband_loss_db'][1]:.1f} dB")
    open(os.path.join(HERE, "twinband_results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(out, open(os.path.join(HERE, "twinband_summary.json"), "w"), indent=1)
    print("\n".join(lines))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
