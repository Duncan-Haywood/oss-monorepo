"""Check that each number quoted in draft.md appears in the results file it came from.

Run: python3 paper/check_numbers.py   (stdlib only; exit 1 on any miss)
Each entry is (results file, text that must appear in it, the paper's claim).
The README and LOG carry the same figures; this ties the paper to the raw outputs.
"""
import pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent.parent
LOG = (HERE / "LOG.md").read_text()
CHECKS = [
    ("experiments/correction_search/results.txt", "1.086", "best section ratio 1.086"),
    ("experiments/correction_search/results.txt", "1.157", "uncorrected ratio 1.157"),
    ("experiments/tail_search/results.txt", "naca0015 0.15 5.0 3.5", "best tail (0015, area 0.15, AR_t 5, arm 3.5)"),
    ("experiments/uiuc_naca241x/results.txt", "min 1.215  max 1.669", "NF/UIUC ratio 1.22 to 1.67"),
    ("experiments/uiuc_naca241x/results.txt", "mean 1.355", "mean ratio 1.36"),
    ("experiments/demonstrator_spec/results.txt", "6.1", "CG tolerance 6.1 mm"),
    ("experiments/demonstrator_spec/results.txt", "5.2", "CG tolerance 5.2 mm"),
    ("experiments/demonstrator_spec/results.txt", "2078", "span 2,078 mm"),
    ("experiments/tail_gust/results.txt", "within 10% at H = 12.5: 72 of 78", "72 of 78 within 10%"),
    ("experiments/tail_gust/results.txt", "all three H: 24 of 78", "24 of 78 within 5%"),
    ("experiments/tail_gust/results.txt", "1.2%", "best design 1.2%"),
    ("experiments/rodrigues_energy/results_days.txt", "1.539", "day-cluster exponent"),
    ("experiments/rodrigues_energy/results_days.txt", "1.529", "date fixed effect exponent"),
]
LOGCHECKS = [  # figures that exist in LOG.md outcomes (the results files print them in tables)
    "78 of 4,474", "0 of 17", "+13% to +25%", "0.035 chords", "17 of 144", "78, 81, 79, 80",
    "1.29 to 1.45", "0.37 to 0.52", "6.5% faster", "97%",
    "76 at every true slope scale", "67 of the 78 designs keep every gust peak", "84 to 86% at sigma 2%",
    "0.33%, 0.70%, 4.45%", "66 of 78", "63, 51, 0, 0",
    "19.1% then 0.74%", "144 (LS start) against 9", "0.07, 0.65, 1.38%", "86.4 J/m [81.2, 91.5]", "77.4% [73.8, 80.8]", "153.8 against 60.1", "9.6 kJ [8.9, 10.3]", "384 J per metre", "0.26, 1.51, 2.55", "0.25, 1.21, 1.63", "median 0.878", "0.07, 0.67, 1.51%",
]
bad = 0
for path, needle, claim in CHECKS:
    text = (HERE / path).read_text()
    ok = needle in text
    bad += not ok
    print(("ok   " if ok else "MISS ") + f"{claim}: {needle!r} in {path}")
readme = (HERE / "README.md").read_text()
for needle in LOGCHECKS:
    ok = needle in LOG or needle in readme
    bad += not ok
    print(("ok   " if ok else "MISS ") + f"{needle!r} in LOG.md/README.md")
sys.exit(1 if bad else 0)
