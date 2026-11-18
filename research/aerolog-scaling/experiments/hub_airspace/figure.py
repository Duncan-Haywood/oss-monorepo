"""Write conflicts_per_flight.svg: en-route conflicts per flight against flights per hour (milestone 11a).

    python3 figure.py

Numbers are parsed from the committed results.txt (sections A and C), never retyped. The gas-model line is
section A's NYC gas rate at 60 flights/h, scaled as lambda^2 (so per flight as lambda).
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    text = (HERE / "results.txt").read_text().splitlines()
    on, xs, single, single15, split15 = False, [], [], [], []
    gas60 = None
    for l in text:
        if l.startswith("nyc      |"):
            gas60 = float(l.split("|")[4].split()[0])
        if l.startswith("## C."):
            on = True
            continue
        if on:
            m = re.match(r"\s*(\d+) \|", l)
            if not m:
                if xs:
                    break
                continue
            cells = [float(c.split()[0]) for c in l.split("|")[1:5]]
            xs.append(float(m.group(1)))
            single.append(cells[0])
            single15.append(cells[1])
            split15.append(cells[3])
    gas = [gas60 / 60 * x / 60 for x in xs]
    series = [("one layer", xs, single), ("one layer, v+-15%", xs, single15),
              ("split, v+-15%", xs, split15), ("gas model", xs, gas)]
    write_lines(HERE, "conflicts_per_flight.svg",
                "Delivery hub: en-route conflicts per flight (NYC destinations, 20 m/s, R 50 m)",
                "Log-log line plot: simulated en-route losses of separation per flight grow linearly with flights per "
                "hour, about 0.1 at 60 flights/h in one layer; the gas model is about 7 times lower; separating "
                "outbound and inbound layers cuts conflicts about 20-fold",
                "flights per hour from the hub", "conflicts per flight outside 250 m", series, logx=True, logy=True)


if __name__ == "__main__":
    main()
