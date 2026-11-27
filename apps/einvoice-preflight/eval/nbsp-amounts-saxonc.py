"""SaxonC-HE's reading of each INV-065 mutant (eval/nbsp-amounts.mjs --out DIR).

For every mutant row it asks SaxonC-HE (PyPI saxonche) whether the original
and the mutated value can be cast to xs:decimal, xs:date, xs:boolean, xs:dateTime or xs:time
(the last two added 2026-11-18), which
is what a validator's rules do with an amount, quantity, date or indicator.
INV-065 is right on a row when Saxon casts the original and not the mutant.
    python3 -I eval/nbsp-amounts-saxonc.py DIR
"""

import json
import sys
from collections import Counter

from saxonche import PySaxonProcessor

TEST = (
    "($v castable as xs:decimal) or ($v castable as xs:date) or ($v castable as xs:boolean)"
    " or ($v castable as xs:dateTime) or ($v castable as xs:time)"
)


def main(out_dir: str) -> int:
    rows = [json.loads(line) for line in open(f"{out_dir}/mutants.jsonl", encoding="utf-8") if line.strip()]
    tally = Counter()
    cache = {}
    with PySaxonProcessor(license=False) as proc:
        xp = proc.new_xpath_processor()

        def castable(value: str) -> bool:
            if value not in cache:
                xp.set_parameter("v", proc.make_string_value(value))
                cache[value] = xp.evaluate_single(TEST).boolean_value
            return cache[value]

        xp.declare_variable("v")
        for row in rows:
            before, after = castable(row["original"]), castable(row["mutated"])
            agrees = before and not after
            fired = row["after"] == "inv065OnPath"
            tally["rows"] += 1
            tally["saxon casts original"] += before
            tally["saxon refuses mutant"] += not after
            tally["INV-065 and Saxon agree"] += agrees == fired
            if row.get("kind") == "time":
                tally["time/dateTime rows"] += 1
                tally["time/dateTime agree"] += agrees == fired
            if agrees != fired:
                print("disagree:", row["file"].rsplit("/", 1)[-1], row["xpath"], row["variant"], repr(row["mutated"]))
        print(proc.version)
    print(json.dumps(dict(tally), indent=2))
    return 0 if tally["INV-065 and Saxon agree"] == tally["rows"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
