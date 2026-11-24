"""Build site/nikon-af-grids.mjs: where each Nikon phase-detect AF point sits in the frame.

Nikon's maker note (AFInfo2, tag 0xb7) names the AF points a DSLR used by number (PrimaryAFPoint) or by bit
(AFPointsUsed, AFPointsInFocus) on a per-schema grid (51, 39, 153, 105 or 81 points). Nikon publishes no
coordinates for those grids. Two open sources together give them:

- ExifTool's Nikon.pm (Phil Harvey; Perl Artistic / GPL licence) maps point numbers and bits to grid names
  (``%afPoints51``: 1 => 'C6', 2 => 'B6', ...). Only those number-to-name facts are taken.
- The Focus-Points Lightroom plugin (github.com/FocusPointsLrC/Focus-Points, Apache-2.0; original work
  Whizzbang Inc, maintained by Karsten Gieselmann; files submitted by its users, named in each file) measured
  each body's points in pixels of the full frame: ``focus_points/nikon/<model>.txt`` lines like
  ``C6 = {3680, 2456, 295, 240}`` (centre x, y, width, height), with the frame size in the header.

This script turns each body's pixels into fractions of its stated frame and writes them, the number-to-name
tables, and the plugin's model aliases (NikonDuplicates.lua) into one ES module the cull page imports.

For the 153-point bodies (D5, D500, D850) the plugin lists only the 55 selectable points (odd rows; columns 1,
3, 4, 6, 7, 9, 11, 12, 14, 15, 17). In auto-area the camera can report any of the 153, so the other 98 are
placed by linear interpolation along their row and column between measured neighbours, and flagged with a
fifth value 1 so the page can say so.

    git clone --depth 1 https://github.com/FocusPointsLrC/Focus-Points.git fp
    curl -sSLo Nikon.pm https://raw.githubusercontent.com/exiftool/exiftool/master/lib/Image/ExifTool/Nikon.pm
    python3 tools/nikon_af_grids.py fp Nikon.pm > site/nikon-af-grids.mjs
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

LINE = re.compile(r"^\s*([A-Z]\d{1,2})\s*=\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*(?:,\s*(\d+)\s*,\s*(\d+)\s*)?\}")
# Files whose points are all one size give it once: ``focusPointDimens = {250, 250}`` and ``B1 = {1185, 1530}``.
DIMENS = re.compile(r"^\s*focusPointDimens\s*=\s*\{\s*(\d+)\s*,\s*(\d+)\s*\}")
SIZE = re.compile(r"(\d{4,5})\s*\D{1,3}\s*(\d{4,5})")


def parse_points_file(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    head = "\n".join(text.splitlines()[:6])
    m = SIZE.search(head)
    if not m:
        raise SystemExit(f"{path}: no frame size in the header")
    w, h = int(m.group(1)), int(m.group(2))
    pts = {}
    dim = None
    for line in text.splitlines():
        dm = DIMENS.match(line)
        if dm:
            dim = (int(dm.group(1)), int(dm.group(2)))
        lm = LINE.match(line)
        if lm:
            name, x, y = lm.group(1), int(lm.group(2)), int(lm.group(3))
            pw, ph = (int(lm.group(4)), int(lm.group(5))) if lm.group(4) else (dim or (0, 0))
            pts[name] = [x / w, y / h, pw / w, ph / h]
    ctx = re.search(r"AF-System:\s*(\d+)", head)
    by = re.search(r"Submitted by:\s*(.+)", head)
    return {"frame": [w, h], "listed": int(ctx.group(1)) if ctx else len(pts), "by": by.group(1).strip() if by else "",
            "pts": pts}


def split_name(n: str) -> tuple[int, int]:
    return ord(n[0]) - 65, int(n[1:])


def fill_153(pts: dict) -> dict:
    """Interpolate the 98 unlisted points of the 9 x 17 grid from the listed 55 (rows A, C, E, G, I)."""
    out = {k: v + [0] for k, v in pts.items()}
    cols = range(1, 18)
    rows = "ABCDEFGHI"
    # Along each listed row, fill missing columns between the nearest listed ones.
    for r in rows[::2]:
        have = sorted(c for c in cols if f"{r}{c}" in pts)
        for c in cols:
            if f"{r}{c}" in out:
                continue
            lo = max((k for k in have if k < c), default=None)
            hi = min((k for k in have if k > c), default=None)
            if lo is None or hi is None:
                continue
            a, b = pts[f"{r}{lo}"], pts[f"{r}{hi}"]
            t = (c - lo) / (hi - lo)
            out[f"{r}{c}"] = [a[i] + t * (b[i] - a[i]) for i in range(4)] + [1]
    # Even rows (B, D, F, H) midway between the rows either side.
    for i in range(1, 9, 2):
        r, up, dn = rows[i], rows[i - 1], rows[i + 1]
        for c in cols:
            a, b = out.get(f"{up}{c}"), out.get(f"{dn}{c}")
            if a and b:
                out[f"{r}{c}"] = [(a[k] + b[k]) / 2 for k in range(4)] + [1]
    return out


def perl_table(src: str, name: str) -> dict[int, str]:
    m = re.search(r"my %" + name + r" = \((.*?)\n\);", src, re.S)
    if not m:
        raise SystemExit(f"Nikon.pm: no %{name}")
    return {int(k): v for k, v in re.findall(r"(\d+)\s*=>\s*'([A-K]\d{1,2})'", m.group(1))}


def perl_array(src: str, name: str) -> dict[int, str]:
    """ExifTool's @afPoints405-style lists index bits from 0; return them numbered from 1 like the hashes."""
    m = re.search(r"my @" + name + r" = \(qw\((.*?)\)\);", src, re.S)
    if not m:
        raise SystemExit(f"Nikon.pm: no @{name}")
    return {i + 1: n for i, n in enumerate(m.group(1).split())}


def aliases(lua: str) -> dict[str, str]:
    return dict(re.findall(r'NikonDuplicates\["([^"]+)"\]\s*=\s*"([^"]+)"', lua))


def main(fp_root: str, nikon_pm: str) -> None:
    root = Path(fp_root) / "focuspoints.lrplugin"
    src = Path(nikon_pm).read_text(encoding="latin-1")
    rev = subprocess.run(["git", "-C", fp_root, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    ver = re.search(r"\$VERSION = '([\d.]+)'", src)
    bodies = {}
    for f in sorted((root / "focus_points" / "nikon").glob("nikon d*.txt")):
        g = parse_points_file(f)
        key = f.stem.upper()  # "NIKON D800", "NIKON D780-51"
        pts = g["pts"]
        if g["listed"] == 55:
            pts = fill_153(pts)
        else:
            pts = {k: v + [0] for k, v in pts.items()}
        bodies[key] = {"frame": g["frame"], "by": g["by"],
                       "pts": {k: [round(x, 5) for x in v[:4]] + ([1] if v[4] else []) for k, v in sorted(pts.items())}}
    for f in sorted((root / "focus_points" / "nikon").glob("nikon z*.txt")):
        g = parse_points_file(f)
        # 81: the grid Z bodies of the Expeed 6 generation report when they write no AF coordinates; 405, 299,
        # 231: the auto-area grids of Z8/Z9, Z6III/Zf/Z5II and Z50II (ExifTool's @afPoints405 etc.).
        if len(g["pts"]) in (81, 405, 299, 231):
            bodies[f.stem.upper()] = {"frame": g["frame"], "by": g["by"],
                                      "pts": {k: [round(x, 5) for x in v] for k, v in sorted(g["pts"].items())}}
    alias = {k.upper(): v.upper() for k, v in aliases((root / "NikonDuplicates.lua").read_text()).items()
             if v.upper() in bodies}
    tables = {n: perl_table(src, f"afPoints{n}") for n in (51, 39, 153, 105, 81)}
    tables.update({n: perl_array(src, f"afPoints{n}") for n in (405, 299, 231)})
    print("// Generated by tools/nikon_af_grids.py; do not edit by hand.")
    print("// Point coordinates: Focus-Points Lightroom plugin (github.com/FocusPointsLrC/Focus-Points,")
    print(f"// commit {rev[:12]}), Apache License 2.0; original work (c) Whizzbang Inc, maintenance (c) Karsten")
    print("// Gieselmann; each body measured by the contributor named in `by`. Converted to fractions of each")
    print("// body's full frame [x centre, y centre, width, height]; a fifth value 1 marks a 153-point position")
    print("// interpolated here between measured neighbours (the plugin lists the 55 selectable points).")
    print(f"// Point numbers to names: ExifTool {ver.group(1) if ver else ''} Nikon.pm (%afPoints51, @afPoints405 etc.), by")
    print("// Phil Harvey; index i is the point of bit i - 1 (byte (i - 1) >> 3, bit (i - 1) & 7).")
    print("export const NIKON_AF_BODIES = " + json.dumps(bodies, separators=(",", ":")) + ";")
    print("export const NIKON_AF_ALIASES = " + json.dumps(alias, separators=(",", ":")) + ";")
    print("export const NIKON_AF_NAMES = " + json.dumps({str(n): [t.get(i, "") for i in range(max(t) + 1)]
                                                          for n, t in tables.items()}, separators=(",", ":")) + ";")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
