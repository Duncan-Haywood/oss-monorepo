"""The altitude-layer paper draft quotes only numbers present in the committed results files."""
import importlib.util
import os

PAPER = os.path.join(os.path.dirname(__file__), "..", "paper")


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(PAPER, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_airspace_paper_numbers_match_results():
    assert _load("check_airspace_numbers").main() == 0


def test_band_count_figure_reads_four_sigmas():
    figs = _load("airspace_figures")
    series = figs.band_curves(12)
    assert [s[0] for s in series] == ["M = 12, sigma 0.5 m", "M = 12, sigma 1 m", "M = 12, sigma 2 m", "M = 12, sigma 3 m"]
    # sigma = 1 m: the minimum over k sits at k = 5 (13.33 m), as the LOG's 11ai post hoc says
    xs, ys = series[1][1], series[1][2]
    assert xs[ys.index(min(ys))] == 5
