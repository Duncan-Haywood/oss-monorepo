"""Write experiments/gate_coverage.svg: coverage of the 95% interval against the coder's prevalence bias for
naive, always-PPI and audit-gated estimates, parsed from results.txt (E1 and E2).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

lines = (HERE / "results.txt").read_text().splitlines()


def block(prefix):
    i = next(k for k, l in enumerate(lines) if l.startswith(prefix))
    rows = []
    for l in lines[i + 2:]:
        if not l.strip():
            break
        rows.append(l.split())
    return [r for r in rows if r[0].startswith("nb_")]


bias = {r[0]: float(r[2]) for r in block("E1.")}
e2 = sorted(block("E2."), key=lambda r: bias[r[0]])
xs = [bias[r[0]] for r in e2]
series = [("always PPI", xs, [float(r[4]) for r in e2]),
          ("audit-gated", xs, [float(r[5]) for r in e2]),
          ("naive", xs, [float(r[2]) for r in e2])]
write_lines(HERE, "gate_coverage.svg", "Coverage of the 95% interval against the coder's prevalence bias (200 hand-coded items)",
            "Line plot: always-PPI coverage stays near 0.95 at every bias; naive coverage is 0 except at zero bias; "
            "audit-gated coverage is 0.96 at zero bias, falls to 0.08 for biases of 2.6 points and recovers only to 0.80 to 0.88 at biases of 6 to 13 points",
            "coder prevalence bias (coded share minus true share)", "coverage", series, logx=False, logy=False, hline=0.95)
