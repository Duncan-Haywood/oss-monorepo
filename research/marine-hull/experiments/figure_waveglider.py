"""Figure for milestone 6p: fielded Wave Glider speed against buoy wave height, early and late in the mission, with the
fitted foil model at the median period. Reads experiments/data/waveglider_hourly.csv and the fitted r from
experiments/results_waveglider.txt (never retyped).
Run: PYTHONPATH=src python3 experiments/figure_waveglider.py"""
import csv, re, statistics as st, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines
from marine_hull.waveglider import Table

rows = [r for r in csv.DictReader(open(HERE / "data/waveglider_hourly.csv")) if float(r["speed"]) >= 0.1]
r_fit = float(re.search(r"fitted r ([0-9.]+)", (HERE / "results_waveglider.txt").read_text()).group(1))


def binned(sel):
    b = {}
    for x in sel:
        b.setdefault(int(float(x["wvht"]) / 0.25), []).append(float(x["speed"]))
    ks = [k for k in sorted(b) if len(b[k]) >= 20]
    return [k * 0.25 + 0.125 for k in ks], [st.median(b[k]) for k in ks]


early = binned([x for x in rows if "2015-06" <= x["hour"][:7] <= "2015-07"])
late = binned([x for x in rows if "2015-08" <= x["hour"][:7] <= "2015-10"])
tp = st.median(float(x["dpd"]) for x in rows)
t = Table()
hs = [0.75 + 0.25 * i for i in range(11)]
write_lines(HERE, "waveglider_speed.svg",
            "Fielded Wave Glider speed vs wave height (Hawaii, 2015)",
            "Median hourly through-water speed of the Honey Badger Wave Glider by nearest-buoy significant wave height, "
            "June-July and August-October 2015, with the one-parameter foil model at the median dominant period.",
            "significant wave height at nearest NDBC buoy (m)", "through-water speed (m/s)",
            [("Jun-Jul 2015", *early), ("Aug-Oct 2015", *late),
             (f"foil model (Tp {tp:g} s)", hs, [t.speed(r_fit, h, tp) for h in hs])])
