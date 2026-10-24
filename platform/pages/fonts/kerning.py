"""Write kerning.json: GPOS pair kerning of the vendored Inter subsets.

The card rasteriser (platform/pages/fontraster.mjs) reads TrueType outlines
itself but does not parse GPOS, so the pair adjustments are flattened once
here, keyed by character pair, in font units. Re-run after replacing a font:

    pip install fonttools && python3 platform/pages/fonts/kerning.py
"""

import json
from pathlib import Path

from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent


# Headlines on a card are English titles: printable ASCII and the typographic
# quotes and dashes. Accented pairs would triple the file for pairs no card
# has drawn; an unlisted pair is simply set unkerned.
EXTRA = {0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D}


def kept(code):
    return 0x20 <= code <= 0x7E or code in EXTRA


def pair_values(font):
    gpos = font["GPOS"].table
    cmap = font.getBestCmap()
    by_glyph = {}
    for code, name in cmap.items():
        by_glyph.setdefault(name, []).append(code)
    out = {}

    def add(left, right, value):
        if not value:
            return
        for a in by_glyph.get(left, []):
            for b in by_glyph.get(right, []):
                if not (kept(a) and kept(b)):
                    continue
                key = chr(a) + chr(b)
                # The first lookup that sets a pair wins, as in a shaper.
                out.setdefault(key, value)

    feature_lookups = set()
    for record in gpos.FeatureList.FeatureRecord:
        if record.FeatureTag == "kern":
            feature_lookups.update(record.Feature.LookupListIndex)
    for index in sorted(feature_lookups):
        lookup = gpos.LookupList.Lookup[index]
        for sub in lookup.SubTable:
            if lookup.LookupType == 9:
                sub = sub.ExtSubTable
            if sub.LookupType != 2:
                continue
            if sub.Format == 1:
                for first, pairset in zip(sub.Coverage.glyphs, sub.PairSet):
                    for rec in pairset.PairValueRecord:
                        v = getattr(rec.Value1, "XAdvance", 0) or 0
                        add(first, rec.SecondGlyph, v)
            elif sub.Format == 2:
                class1 = sub.ClassDef1.classDefs
                class2 = sub.ClassDef2.classDefs
                firsts = sub.Coverage.glyphs
                seconds = list(by_glyph)
                for first in firsts:
                    c1 = class1.get(first, 0)
                    row = sub.Class1Record[c1].Class2Record
                    for second in seconds:
                        c2 = class2.get(second, 0)
                        v = getattr(row[c2].Value1, "XAdvance", 0) or 0
                        add(first, second, v)
    return out


def main():
    result = {}
    for path in sorted(HERE.glob("*.ttf")):
        result[path.stem] = pair_values(TTFont(path))
    (HERE / "kerning.json").write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
    for name, pairs in result.items():
        print(name, len(pairs), "pairs")


if __name__ == "__main__":
    main()
