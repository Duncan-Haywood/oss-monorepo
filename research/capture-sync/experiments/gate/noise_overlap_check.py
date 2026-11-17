"""Step 3c check that the two devices never hear the same noise recording: 1 s chunks of device a's noise
(12 per type) searched in device b's by normalised cross-correlation; a duplicate shows as about 1.0.

    python experiments/gate/noise_overlap_check.py <MS-SNSD root>
"""
import os
import sys

import numpy as np
from scipy.signal import fftconvolve

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import noisetype as N  # noqa: E402

nz = N.noises(sys.argv[1])
rng = np.random.default_rng(5)
for t, (A, B) in nz.items():
    m = []
    for _ in range(12):
        i = rng.integers(0, len(A) - 16000)
        q = A[i:i + 16000] - A[i:i + 16000].mean()
        c = fftconvolve(B, q[::-1], mode="valid")
        e = np.sqrt(np.maximum(fftconvolve(B ** 2, np.ones(16000), mode="valid"), 0)) * np.linalg.norm(q) + 1e-12
        m.append(float(np.max(np.abs(c) / e)))
    print(f"{t:21s} max {max(m):.2f} median {np.median(m):.2f}", flush=True)
