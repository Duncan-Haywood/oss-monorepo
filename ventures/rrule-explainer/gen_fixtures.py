"""Generate rrule.fixtures.json: random RRULEs expanded by python-dateutil.

The fixtures are the outside oracle for rrule.diff.test.mjs. They are data
produced by running python-dateutil (Apache-2.0 / BSD-3-Clause); no dateutil
code is copied into the engine.

    python3 -m venv /tmp/v && /tmp/v/bin/pip install python-dateutil
    /tmp/v/bin/python gen_fixtures.py            # writes rrule.fixtures.json

Rules are generated within what RFC 5545 allows for each FREQ, so a
disagreement is about expansion, not about which invalid rules a library
tolerates. One deliberate exception is a separate "mixed BYDAY" group (MO
together with 2MO), where dateutil intersects the two kinds and the RFC reads
a list as a union; rrule.diff.test.mjs checks that group in both modes.
"""

import itertools
import json
import random
import signal
import sys
from datetime import datetime, timedelta

import dateutil
from dateutil.rrule import rrulestr

SEED = 20261114
N_RULES = 1600
TAKE = 20
WD = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]


def pick(rng, lo, hi, k, signed=False):
    vals = set()
    for _ in range(k):
        v = rng.randint(lo, hi)
        if signed and rng.random() < 0.35:
            v = -v
        vals.add(v)
    return sorted(vals)


def make_rule(rng, mixed=False):
    freq = rng.choices(
        ["YEARLY", "MONTHLY", "WEEKLY", "DAILY", "HOURLY", "MINUTELY"],
        weights=[30, 30, 20, 12, 6, 2],
    )[0]
    parts = [f"FREQ={freq}"]
    if rng.random() < 0.4:
        parts.append(f"INTERVAL={rng.randint(2, 5)}")
    ordinal_ok = freq in ("MONTHLY", "YEARLY")
    weekno = False
    if freq == "YEARLY" and rng.random() < 0.15:
        weekno = True
        parts.append("BYWEEKNO=" + ",".join(map(str, pick(rng, 1, 53, rng.randint(1, 3), True))))
    if rng.random() < 0.3 and freq != "WEEKLY":
        parts.append("BYMONTH=" + ",".join(map(str, pick(rng, 1, 12, rng.randint(1, 3)))))
    if rng.random() < 0.45 or mixed:
        days = rng.sample(WD, rng.randint(1, 3))
        items = []
        # Within the RFC group a list is all plain or all ordinal: dateutil
        # reads a mixed list differently, and that has its own group.
        ordinal = ordinal_ok and not weekno and rng.random() < 0.4
        for i, d in enumerate(days):
            if mixed:
                items.append(d if i == 0 else f"{rng.choice([1, 2, -1])}{d}")
            elif ordinal:
                n = rng.choice([1, 2, 3, 4, -1, -2]) if (freq == "MONTHLY" or "BYMONTH" in ";".join(parts)) else rng.choice([1, 2, 10, 20, -1, -5, 53])
                items.append(f"{n}{d}")
            else:
                items.append(d)
        if mixed:
            freq = rng.choice(["MONTHLY", "YEARLY"])
            parts[0] = f"FREQ={freq}"
            items = [items[0], f"{rng.choice([1, 2, -1])}{rng.choice(WD)}"]
        parts.append("BYDAY=" + ",".join(items))
    if freq != "WEEKLY" and rng.random() < 0.3:
        parts.append("BYMONTHDAY=" + ",".join(map(str, pick(rng, 1, 31, rng.randint(1, 3), True))))
    if freq == "YEARLY" and rng.random() < 0.12:
        parts.append("BYYEARDAY=" + ",".join(map(str, pick(rng, 1, 366, rng.randint(1, 3), True))))
    if freq in ("HOURLY", "MINUTELY") or rng.random() < 0.15:
        if rng.random() < 0.6:
            parts.append("BYHOUR=" + ",".join(map(str, pick(rng, 0, 23, rng.randint(1, 3)))))
    if freq == "MINUTELY" or rng.random() < 0.1:
        parts.append("BYMINUTE=" + ",".join(map(str, pick(rng, 0, 59, rng.randint(1, 3)))))
    if rng.random() < 0.05:
        parts.append("BYSECOND=" + ",".join(map(str, pick(rng, 0, 59, 2))))
    has_by = any(p.startswith("BY") for p in parts)
    if has_by and rng.random() < 0.25:
        parts.append("BYSETPOS=" + ",".join(map(str, pick(rng, 1, 4, rng.randint(1, 2), True))))
    if rng.random() < 0.25:
        parts.append("WKST=" + rng.choice(WD))
    return parts


class Timeout(Exception):
    pass


def alarm(_sig, _frame):
    raise Timeout()


def main():
    rng = random.Random(SEED)
    signal.signal(signal.SIGALRM, alarm)
    cases = []
    skipped = 0
    while len(cases) < N_RULES:
        mixed = len(cases) >= N_RULES - 100
        parts = make_rule(rng, mixed)
        start = datetime(1990, 1, 1) + timedelta(days=rng.randint(0, 365 * 50), seconds=rng.randint(0, 86399) // 60 * 60)
        tail = rng.random()
        if tail < 0.3:
            parts.append(f"COUNT={rng.randint(1, 30)}")
        elif tail < 0.55:
            until = start + timedelta(days=rng.randint(0, 900), seconds=rng.randint(0, 86399))
            parts.append("UNTIL=" + until.strftime("%Y%m%dT%H%M%S"))
        rule = ";".join(parts)
        signal.alarm(2)
        try:
            out = list(itertools.islice(rrulestr(rule, dtstart=start), TAKE))
            signal.alarm(0)
        except Timeout:
            skipped += 1
            continue
        except Exception as e:  # dateutil rejects some combinations
            signal.alarm(0)
            skipped += 1
            print("skip", rule, e, file=sys.stderr)
            continue
        cases.append({
            "rule": rule,
            "dtstart": start.strftime("%Y%m%dT%H%M%S"),
            "group": "mixed-byday" if mixed else "rfc",
            "out": [o.strftime("%Y%m%dT%H%M%S") for o in out],
        })
    doc = {
        "oracle": f"python-dateutil {dateutil.__version__}",
        "python": sys.version.split()[0],
        "seed": SEED,
        "take": TAKE,
        "skipped": skipped,
        "cases": cases,
    }
    with open("rrule.fixtures.json", "w") as f:
        json.dump(doc, f, separators=(",", ":"))
        f.write("\n")
    print(f"{len(cases)} cases, {skipped} skipped")


if __name__ == "__main__":
    main()
