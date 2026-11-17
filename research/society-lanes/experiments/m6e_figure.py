"""Figures for milestone 6e.

m6e_orca_speed.svg: ORCA, people's transit change (s) caused by robots at 20%, against the human side-bias
multiplier (fitted beta 1.0, log axis): seed (crowd-side robots minus a density-matched control), side
(crowd-side minus lateral-goal robots, same bodies) and body (lateral-goal robots minus the control).
m6e_cfsm_speed.svg: collision-free speed at 0.5x, 20% robots: the same three effects on transit against
robot speed.

Reads experiments/m6e_orca_speed_results.txt. Stdlib only. Run: python3 experiments/m6e_figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

LINE = re.compile(r"^\s+(\w+)\s+x([\d.]+)\s+share ([\d.]+) v([\d.]+) (\w+)\s+(.*)$")
EFF = re.compile(r"(\w+) ([-+][\d.]+) \[")


def read():
    d = {}
    for line in (HERE / "m6e_orca_speed_results.txt").read_text().splitlines():
        m = LINE.match(line)
        if not m:
            continue
        for kind, v in EFF.findall(m.group(6)):
            d[(m.group(1), float(m.group(2)), m.group(3), float(m.group(4)), m.group(5), kind)] = float(v)
    return d


def main():
    d = read()
    xs = sorted({k[1] for k in d if k[0] == "orca"})
    names = {"seed": "crowd-side robots vs control", "side": "crowd-side vs lateral-goal robots",
             "body": "lateral-goal robots vs control"}
    series = [(names[k], xs, [d[("orca", x, "0.20", 1.2, "transit", k)] for x in xs]) for k in names]
    write_lines(HERE, "m6e_orca_speed.svg", "Robots in an ORCA crowd: people's transit change by cause",
                "Change in people's 8 m transit time with 20% robots in an ORCA crowd, against the human "
                "side-bias multiplier", "human side-bias multiplier (x fitted beta 1.0)",
                "change in people's transit (s)", series, logx=True, hline=0)
    vs = sorted({k[3] for k in d if k[0] == "cfsm"})
    series = [(names[k], vs, [d[("cfsm", 0.5, "0.20", v, "transit", k)] for v in vs]) for k in names]
    write_lines(HERE, "m6e_cfsm_speed.svg", "Robot speed in a collision-free speed crowd",
                "Change in people's 8 m transit time with 20% robots in the collision-free speed crowd at half "
                "its fitted bias, against robot speed", "robot speed (m/s)", "change in people's transit (s)",
                series, hline=0)


if __name__ == "__main__":
    main()
