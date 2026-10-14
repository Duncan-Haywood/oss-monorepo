"""Run garment-twonodeoptics' switchable two-node model long enough to reach steady state, and
measure the optics effects there. The model itself lives in ../garment-twonodeoptics."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "garment-twonodeoptics", "src"))
from garment_twonodeoptics import flex  # noqa: E402

OURS, REF = flex.OURS, flex.REF
HOUR, STEADY, CHECK = 60, 1440, 2880


def run(*args, minutes=STEADY, **kw):
    return flex.run(*args, minutes=minutes, **kw)


def converged(*args, tol=0.01, **kw):
    """Largest change in tsk, tcr (C) and dry, evap (W/m2) between STEADY and CHECK minutes."""
    a, b = run(*args, minutes=STEADY, **kw), run(*args, minutes=CHECK, **kw)
    return max(abs(a[k] - b[k]) for k in ("tsk", "tcr", "dry", "evap")) <= tol
