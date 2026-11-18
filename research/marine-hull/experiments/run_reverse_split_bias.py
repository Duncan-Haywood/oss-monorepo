"""Milestone 6zu, post hoc (written after the predictions were scored): how far each test window's harvest sits from
the climatology it is planned with, by region, for split R and 6zt's split T.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_reverse_split_bias.py > experiments/results_reverse_split_bias.txt
(stdlib, deterministic, about 30 s)"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_reserve_curve as rc  # noqa: E402
import run_reverse_split as rs  # noqa: E402
import run_year_pack as yp  # noqa: E402

SPLITS = (("R (climatology 2020-2024, test 2015-2019)", rs.SEL, rs.TEST),
          ("T (climatology 2015-2019, test 2020-2024)", rs.TEST, rs.SEL))


def ratio(points, clim_years, test_years):
    """Summed test-year harvest / summed climatology over the same point-days."""
    h = c = 0.0
    for p in points:
        for yr in test_years:
            h += sum(yp.harvest_wh(k) for k in rc.year_sun(p, yr))
            c += sum(rc.climatology_wh(p, yr, years=clim_years))
    return h / c


def main():
    print("Milestone 6zu post hoc: test-window harvest / the climatology it is planned with")
    for name, pts in rs.REGIONS.items():
        for label, clim_years, test_years in SPLITS:
            print(f"{name:5s} {label}: {ratio(pts, clim_years, test_years):.4f}")


if __name__ == "__main__":
    main()
