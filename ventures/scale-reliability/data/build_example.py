"""Build phq9-nhanes-2017-2018.csv from the NHANES 2017-2018 DPQ_J.xpt file.

Standard library only (a minimal SAS XPORT v5 reader). Usage:
    python3 build_example.py DPQ_J.xpt > phq9-nhanes-2017-2018.csv
Keeps the first 1,500 respondents (by SEQN) who answered at least one of the
nine PHQ-9 items, writes codes 0-3 as given and codes 7 (refused) and 9
(don't know) as blanks, and renames the columns (see SOURCE.md).
"""
import struct
import sys

COLS = [
    ("DPQ010", "interest"), ("DPQ020", "down"), ("DPQ030", "sleep"),
    ("DPQ040", "tired"), ("DPQ050", "appetite"), ("DPQ060", "failure"),
    ("DPQ070", "concentration"), ("DPQ080", "slow_or_restless"),
    ("DPQ090", "self_harm_thoughts"),
]
KEEP = 1500


def ibm_to_float(b):
    """IBM System/360 8-byte float, as SAS XPORT v5 stores numbers.

    A missing value is one of the bytes "." "A"-"Z" "_" followed by zeros.
    """
    if b[1:] == b"\x00" * 7 and (b[0] == 0x2E or 0x41 <= b[0] <= 0x5A or b[0] == 0x5F):
        return None
    hi, lo = struct.unpack(">II", b)
    if hi & 0x00FFFFFF == 0 and lo == 0:
        return 0.0
    sign = -1.0 if hi & 0x80000000 else 1.0
    exponent = (hi >> 24) & 0x7F
    mantissa = ((hi & 0x00FFFFFF) << 32 | lo) / float(1 << 56)
    return sign * mantissa * 16.0 ** (exponent - 64)


def read_xport(path):
    data = open(path, "rb").read()
    # Header records are 80 bytes; NAMESTR records are 140 bytes each.
    i = data.index(b"HEADER RECORD*******NAMESTR HEADER RECORD!!!!!!!")
    nvars = int(data[i + 54:i + 58])
    pos = i + 80
    names, lengths = [], []
    for _ in range(nvars):
        rec = data[pos:pos + 140]
        lengths.append(struct.unpack(">h", rec[4:6])[0])
        names.append(rec[8:16].decode("ascii").strip())
        pos += 140
    obs = data.index(b"HEADER RECORD*******OBS     HEADER RECORD!!!!!!!") + 80
    width = sum(lengths)
    rows = []
    while obs + width <= len(data):
        rec = data[obs:obs + width]
        if rec.strip(b" ") == b"":
            break
        vals, off = {}, 0
        for n, w in zip(names, lengths):
            vals[n] = ibm_to_float(rec[off:off + w].ljust(8, b"\x00"))
            off += w
        rows.append(vals)
        obs += width
    return rows


def main(path):
    rows = sorted(read_xport(path), key=lambda r: r["SEQN"])
    out = ["seqn," + ",".join(n for _, n in COLS)]
    kept = 0
    for r in rows:
        vals = [r.get(c) for c, _ in COLS]
        if all(v is None for v in vals):
            continue
        cells = []
        for v in vals:
            cells.append("" if v is None or v in (7.0, 9.0) else str(int(round(v))))
        out.append(f"{int(r['SEQN'])}," + ",".join(cells))
        kept += 1
        if kept == KEEP:
            break
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main(sys.argv[1])
