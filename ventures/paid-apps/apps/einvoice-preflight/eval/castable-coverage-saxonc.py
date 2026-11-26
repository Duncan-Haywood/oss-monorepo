"""Which leaf values does Saxon cast that INV-065's CASTABLE pattern does not take?

Reads DIR/leaves.jsonl (eval/nbsp-other-formats.mjs --out DIR): every distinct
(format, element, value) of a leaf. For each it asks SaxonC-HE (PyPI saxonche)
whether the value casts as xs:decimal, xs:date, xs:boolean, xs:dateTime or
xs:time, and compares with the `castable` flag xmlvalues.mjs's CASTABLE gave.
A value Saxon casts and CASTABLE refuses is a field where a no-break space
would go unreported; one CASTABLE takes and Saxon refuses would be a false
INV-065. Exit 1 on any disagreement.
    python3 -I eval/castable-coverage-saxonc.py DIR
Added 2026-11-18 (eval/datetime-leaves-2026-11-18.md).
"""

import json
import sys
from collections import Counter

from saxonche import PySaxonProcessor

TYPES = ["xs:decimal", "xs:date", "xs:boolean", "xs:dateTime", "xs:time"]


def main(out_dir: str) -> int:
    rows = [json.loads(line) for line in open(f"{out_dir}/leaves.jsonl", encoding="utf-8") if line.strip()]
    tally = Counter()
    misses = Counter()
    with PySaxonProcessor(license=False) as proc:
        xp = proc.new_xpath_processor()
        xp.declare_variable("v")
        tests = {t: f"$v castable as {t}" for t in TYPES}
        for row in rows:
            xp.set_parameter("v", proc.make_string_value(row["value"]))
            kinds = [t for t in TYPES if xp.evaluate_single(tests[t]).boolean_value]
            saxon = bool(kinds)
            tally["distinct values"] += 1
            tally["saxon casts"] += saxon
            tally["CASTABLE takes"] += row["castable"]
            for t in kinds:
                tally[f"saxon casts as {t}"] += 1
            if saxon != row["castable"]:
                tally["disagree"] += 1
                misses[(row["format"], row["element"], "/".join(kinds) or "none", row["castable"])] += 1
                if tally["disagree"] <= 400:
                    print("disagree:", row["format"], row["element"], repr(row["value"]), kinds, "CASTABLE" if row["castable"] else "not CASTABLE", row["file"])
        print(proc.version)
    print(json.dumps(dict(tally), indent=2))
    for key, n in misses.most_common():
        print(n, *key)
    return 0 if not tally["disagree"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
