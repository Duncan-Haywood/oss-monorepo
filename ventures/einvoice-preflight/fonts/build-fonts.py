"""Build the two fonts the Factur-X PDF writer embeds (facturx-pdf.mjs).

Source: Liberation Sans 2.x (SIL OFL 1.1, Reserved Font Names "Liberation",
"Arimo"), as shipped by Debian's fonts-liberation2. The OFL lets a modified
copy ship with software only under a name without the reserved ones, so the
subset is renamed "Preflight Sans". Kept: Latin (Basic, Latin-1, Extended A
and B), Greek, Cyrillic, dashes, quotes, the euro, rupee, lira and ruble signs.
Dropped: hinting and layout tables (a PDF viewer does not need them).

    python3 -m pip install fonttools
    python3 fonts/build-fonts.py /usr/share/fonts/truetype/liberation
"""
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

UNICODES = ("U+0020-007E,U+00A0-024F,U+0370-03FF,U+0400-045F,U+0490-0491,U+2010-2027,"
            "U+2030,U+2039-203A,U+20AC,U+20B9,U+20BA,U+20BD,U+2116,U+2122,U+2212")
HERE = Path(__file__).resolve().parent


def build(src, weight):
    font = TTFont(src)
    opts = subset.Options()
    opts.hinting = False
    opts.layout_features = []
    opts.drop_tables += ["GSUB", "GPOS", "GDEF", "kern", "DSIG", "FFTM", "gasp", "prep", "fpgm", "cvt "]
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    family, full, ps = "Preflight Sans", f"Preflight Sans {weight}", f"PreflightSans-{weight}"
    names = {1: family, 2: weight, 3: f"{ps};subset of Liberation Sans 2", 4: full, 6: ps}
    for rec in font["name"].names:
        if rec.nameID in names:
            rec.string = names[rec.nameID]
        elif rec.nameID == 0:
            rec.string = (str(rec.toUnicode()) + " Subset and renamed under the SIL OFL 1.1.").strip()
    font["name"].names = [r for r in font["name"].names if r.platformID == 3 or r.nameID in names or r.nameID == 0]
    out = HERE / f"PreflightSans-{weight}.ttf"
    font.save(out)
    return out


if __name__ == "__main__":
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/truetype/liberation")
    for weight in ("Regular", "Bold"):
        print(build(root / f"LiberationSans-{weight}.ttf", weight))
