"""Post-hoc diagnostic (after the 2019 scores; not a detector): day-of-week pattern in the nightly minimum.

    python experiments/step6-mnf/weekly.py   # reads night.tsv, prints the table quoted in README and LOG

2018 only. Each night's minimum minus the median of the 7 nights centred on it, grouped by weekday.
"""
import numpy as np
from pathlib import Path
from numpy.lib.stride_tricks import sliding_window_view

HERE = Path(__file__).resolve().parent
rows = [ln.split("\t") for ln in (HERE / "night.tsv").read_text().split("\n")[1:] if ln]
d = np.array([r[0] for r in rows], dtype="datetime64[D]")
m = np.array([float(r[1]) for r in rows])
dow = (d.astype(int) + 3) % 7  # 0 = Monday
res = m - np.median(sliding_window_view(np.pad(m, 3, mode="edge"), 7), axis=1)
y = d < np.datetime64("2019-01-01")
names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
means = np.array([res[y & (dow == k)].mean() for k in range(7)])
for k in range(7):
    print(f"{names[k]} 00-06: {means[k]:+6.2f} m3/h (sd {res[y & (dow == k)].std():.2f})")
print(f"2018 sd about a 7-night running median: {res[y].std():.2f} m3/h; "
      f"after removing the weekday means: {(res[y] - means[dow[y]]).std():.2f} m3/h")
