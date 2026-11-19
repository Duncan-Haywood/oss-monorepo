"""Find IIQ S blocks whose refinement is above a lane's scale (a negative shift) and report what they carry.

For each file: how many such samples there are, the sample bits they carry, and whether reading the step as a
right shift, as zero, or as a 32-bit wrapped left shift (what LibRaw's C does on x86) changes any sensel on the
rows that hold them against LibRaw's ``raw_image``. One JSON line per file.

Usage (from ``ventures/photo-editing``, rawpy and numpy in the environment)::

    PYTHONPATH=src python tools/iiq_s_shift_check.py FILE.IIQ [...]
"""

from __future__ import annotations

import collections
import json
import sys
from array import array

import numpy as np
import rawpy

from shootflow import iiq


def rows_of(data: bytes, fields: dict, mode: str, only=None):
    """Decode rows (``only`` or all), reading a negative shift as ``mode``; yields (row, values, bits seen there)."""

    offs = array("I")
    offs.frombytes(data[fields["strips"] : fields["strips"] + 4 * fields["height"]])
    if sys.byteorder == "big":
        offs.byteswap()
    scale_of, used_of = iiq._scale_table()
    width = fields["width"]
    for row in only if only is not None else range(fields["height"]):
        b = iiq._Bits(data, fields["data"] + offs[row])
        q = b.get(16) & 7
        sc, last, out, seen = [0, 0], [0, 0], [], []
        for _ in range(width >> 3):
            for lane in (0, 1):
                p = b.get(2)
                if p:
                    sc[lane] += p - 2
                else:
                    w = b.peek(5)
                    sc[lane] = scale_of[w]
                    b.skip(used_of[w])
            r = b.get(1)
            r = 0 if r else b.get(2) + 1
            nb = q + r
            for i in range(8):
                lane, k = i & 1, sc[i & 1]
                if k == 9:
                    v = b.get(14)
                else:
                    bits = b.get(nb) if nb else 0
                    sh = k - r
                    if sh >= 0:
                        inc = bits << sh
                    else:
                        seen.append(bits)
                        inc = bits >> -sh if mode == "right" else 0 if mode == "zero" else (bits << (sh & 31)) & 0xFFFFFFFF
                    v = last[lane] + inc - (0xFFFF >> (17 - q - k))
                    if mode == "wrap":
                        v = (v + 2**31) % 2**32 - 2**31
                last[lane] = v
                out.append(min(65535, max(0, v << 2)))
        while len(out) < width:
            out.append(b.get(14) << 2)
        yield row, out, seen


def main(argv: list[str]) -> int:
    for name in argv:
        data = open(name, "rb").read()
        fields = iiq.info(data)
        row_out = {"file": name.rsplit("/", 1)[-1], "format": fields["format"]}
        if fields["format"] != 6:
            row_out["skipped"] = "not IIQ S"
            print(json.dumps(row_out), flush=True)
            continue
        hit_rows, bits = [], collections.Counter()
        for row, _, seen in rows_of(data, fields, "zero"):
            if seen:
                hit_rows.append(row)
                bits.update(seen)
        row_out.update(rows=len(hit_rows), samples=sum(bits.values()), bits={str(k): v for k, v in sorted(bits.items())})
        if hit_rows:
            ref = rawpy.imread(name).raw_image
            for mode in ("right", "zero", "wrap"):
                diff = sum(int(np.count_nonzero(np.array(out, dtype=np.uint16) != ref[row]))
                           for row, out, _ in rows_of(data, fields, mode, hit_rows))
                row_out[f"differing_{mode}"] = diff
            row_out["sensels_on_those_rows"] = len(hit_rows) * fields["width"]
        print(json.dumps(row_out), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
