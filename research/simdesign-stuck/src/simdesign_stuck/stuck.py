"""Find SIMP runs stuck in a different optimum from the uniform start, and try to free them with penalty continuation.

The OC/FE/filter code is simdesign-startsconverge's run_checkpoints (itself simdesign-topopt's, unchanged);
this module only chains runs at different penalties.
"""
import os, sys
import numpy as np
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "simdesign-startsconverge", "src"))
from simdesign_startsconverge import run_checkpoints


def stuck_starts(designs, ref, thr=0.01):
    """Indices of designs whose 0/1 layout (x > 0.5) differs from `ref` in at least `thr` of the elements."""
    rb = ref > 0.5
    return [i for i, d in enumerate(designs) if float(np.mean((d > 0.5) != rb)) >= thr]


def continue_schedule(x0, nelx, nely, schedule):
    """Run [(penal, iters), ...] in order from x0, each stage starting from the last. Returns the final x.

    The final stage's compliance should be read at the target penalty by the caller; the volume fraction is held
    by the OC update at every stage.
    """
    x = x0.copy()
    for penal, iters in schedule:
        x = run_checkpoints(x, nelx, nely, [iters], penal=penal)[iters]["x"]
    return x
