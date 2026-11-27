"""Dutch VAT checksum: this tool's NL check against python-stdnum's nl.btw.

Draws 9-digit bodies and two-digit suffixes: numbers built to pass the elfproef,
numbers built to pass the 2020 mod 97-10 check, and uniform random ones, then
asks python-stdnum (`pip install python-stdnum`, the reference) and this tool's
Python check (`vat._nl` behind the shape test) whether each is valid. Writes the
drawn numbers and stdnum's verdicts as JSON so `nl-vat-stdnum-differential.mjs`
can ask the page's check (vat.mjs) the same question. No network.

Usage: python3 eval/nl-vat-stdnum-differential.py N SEED OUT.json
"""
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from stdnum.nl import btw  # noqa: E402

from einvoice_preflight.vat import inspect_party_vat  # noqa: E402


def elfproef_body(rng):
    while True:
        head = [rng.randrange(10) for _ in range(8)]
        total = sum(d * w for d, w in zip(head, range(9, 1, -1)))
        check = total % 11
        if check < 10 and any(head + [check]):
            return "".join(map(str, head + [check]))


def mod97_number(rng):
    while True:
        body = "".join(str(rng.randrange(10)) for _ in range(9))
        # two suffix digits chosen so "NL" + body + "B" + suffix is 1 mod 97
        for suffix in range(1, 100):
            text = f"{body}B{suffix:02d}"
            if int("2321" + body + "11" + f"{suffix:02d}") % 97 == 1:
                return text


def main():
    n, seed, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    rng = random.Random(seed)
    rows = []
    for i in range(n):
        kind = ("elfproef", "mod97", "random")[i % 3]
        if kind == "elfproef":
            number = f"{elfproef_body(rng)}B{rng.randrange(1, 100):02d}"
        elif kind == "mod97":
            number = mod97_number(rng)
        else:
            number = f"{rng.randrange(10**9):09d}B{rng.randrange(1, 100):02d}"
        if rng.random() < 0.3:  # a one-digit typo of a drawn number
            pos = rng.choice([p for p in range(12) if p != 9])
            number = number[:pos] + str((int(number[pos]) + rng.randrange(1, 10)) % 10) + number[pos + 1:]
            kind += "+typo"
        vat = "NL" + number
        ref = btw.is_valid(vat)
        mine = not any(f["rule"] == "INV-023" for f in inspect_party_vat({"vat_id": vat}, "supplier"))
        rows.append({"vat": vat, "kind": kind, "stdnum": ref, "py": mine})
    Path(out).write_text(json.dumps(rows))
    tally = {}
    for row in rows:
        t = tally.setdefault(row["kind"], [0, 0, 0])
        t[0] += 1
        t[1] += row["stdnum"]
        t[2] += row["stdnum"] != row["py"]
    print(f"numbers: {len(rows)}, python disagreements with stdnum: {sum(t[2] for t in tally.values())}")
    for kind, (count, valid, off) in sorted(tally.items()):
        print(f"  {kind:16} {count:6} drawn, {valid:6} valid by stdnum, {off} off")


if __name__ == "__main__":
    main()
