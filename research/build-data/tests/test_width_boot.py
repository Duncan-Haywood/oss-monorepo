import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
import numpy as np
from width_boot import row_intervals


def test_wide_qhat_widens_both_ends_and_floors_lower():
    # calibration: intervals [0,2] always miss y=10 by 8 -> qhat positive (about 8)
    lo, hi, q = row_intervals([0.0] * 50, [2.0] * 50, [10.0] * 50, [0.0, 5.0], [2.0, 9.0])
    assert q > 5
    assert lo[0] == 0.0 and hi[0] == 2.0 + q
    assert lo[1] == 0.0 and hi[1] == 9.0 + q   # 5 - q below the floor


def test_nonempty_never_inverts():
    lo, hi, q = row_intervals([0.0] * 50, [0.0] * 50, [0.0] * 50, [0.0, 3.0], [0.0, 4.0])
    assert (np.asarray(hi) >= np.asarray(lo)).all()
