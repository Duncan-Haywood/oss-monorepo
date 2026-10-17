"""Write experiments/room_temp.svg: mean |skin - 33.7 C| for each policy after a rest-to-walk step, by room temperature, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt ("ours" choice set, rest->walk scenarios), never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
POLICIES = [("fixed closed", "fixed closed"), ("fixed open", "fixed open"),
            ("gate 33.2-34.2 lag 0", "gate (33.2-34.2 C)"), ("oracle", "oracle")]


def parse():
    """{policy label: ([room C], [mean error C])} for the rest->walk scenarios of the 'ours' block."""
    out = {lab: ([], []) for _, lab in POLICIES}
    room, on = None, False
    for l in TEXT:
        if l.startswith("== choice set"):
            if on:
                break
            on = " ours:" in l
            continue
        m = re.match(r"-- rest->walk (\d+)C:", l)
        if on and m:
            room = float(m.group(1))
            continue
        if on and l.startswith("-- "):
            room = None
            continue
        s = l.strip()
        if on and room is not None:
            for key, lab in POLICIES:
                if s.startswith(key):
                    out[lab][0].append(room)
                    out[lab][1].append(float(re.search(r"(\d+\.\d+)\s+end tsk|(\d+\.\d+)\s*$", s).group(0).split()[0]))
    if not all(len(v[0]) == 3 for v in out.values()):
        raise SystemExit("expected 3 rest->walk rooms per policy, got " + str({k: len(v[0]) for k, v in out.items()}))
    return out


def main():
    d = parse()
    write_lines(HERE, "room_temp.svg", "Metabolic step: skin-temperature error by room",
                "Line plot of mean skin-temperature error after a rest-to-walk step against room temperature for fixed closed, fixed open, a thermostat gate and the oracle; the gate beats both fixed states only at 24 C",
                "room temperature (C)", "mean |tsk - 33.7| (C)",
                [(lab, *d[lab]) for _, lab in POLICIES])


if __name__ == "__main__":
    main()
