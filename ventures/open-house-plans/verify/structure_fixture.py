"""Write data/structure-fixture.json: member checks computed by the research
track's Python originals (research/house-spans, research/house-framing), so
structure.test.mjs can pin the JavaScript port against them.

    python3 verify/structure_fixture.py      # from ventures/open-house-plans
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
RESEARCH = HERE.parent.parent / "research"
sys.path[:0] = [str(RESEARCH / "house-spans" / "src"), str(RESEARCH / "house-framing" / "src")]

from house_spans.model import CASES, Member, check, max_span, size_member  # noqa: E402
from house_framing.model import Loads, header_check, stud_check  # noqa: E402

out = {"source": "research/house-spans and research/house-framing (Python)", "check": [], "maxSpan": [], "size": [], "stud": [], "header": []}
for size in ("2x6", "2x8", "2x10", "2x12"):
    for spacing in (12.0, 16.0, 24.0):
        for case in ("floor", "roof-snow30", "roof-snow50"):
            for span in (8.0, 12.5, 16.0):
                pitch = 6.0 if case.startswith("roof") else 0.0
                m = Member(size, 1, "SPF", spacing, pitch=pitch)
                out["check"].append({"size": size, "spacing": spacing, "case": case, "span": span, "pitch": pitch, "ratios": check(m, span, CASES[case])})
            m = Member(size, 1, "SPF", spacing)
            out["maxSpan"].append({"size": size, "spacing": spacing, "case": case, "ft": max_span(m, CASES[case])[0]})
for span in (6.0, 10.0, 13.0, 15.0, 18.0, 21.0):
    r = size_member(span, CASES["floor"], "SPF", 16.0)
    out["size"].append({"span": span, "case": "floor", "spacing": 16.0, "result": None if r is None else {"size": r[0], "governs": r[1], "ratio": r[2]}})
for stud in ("2x4", "2x6"):
    for spacing in (16.0, 24.0):
        for width in (20.0, 28.0, 36.0):
            for snow, wind in ((30.0, 0.0), (50.0, 20.0), (30.0, 35.0)):
                loads = Loads(width_ft=width, overhang_ft=1.0, snow_psf=snow, wind_psf=wind)
                out["stud"].append({"stud": stud, "spacing": spacing, "lengthIn": 92.625, "roofPlf": list(loads.roof_plf()), "wind": wind, "ratio": stud_check(stud, spacing, 92.625, loads)})
for size in ("2x6", "2x8", "2x10", "2x12"):
    for span_in in (39.0, 75.0, 111.0):
        for w in (300.0, 600.0, 900.0):
            for plies, jacks in ((2, 1), (3, 1), (2, 2)):
                out["header"].append({"size": size, "spanIn": span_in, "wPlf": w, "plies": plies, "jacks": jacks, "stud": "2x6", "ratio": header_check(size, span_in, w, plies, jacks, "2x6")})
(HERE / "data" / "structure-fixture.json").write_text(json.dumps(out, indent=0) + "\n")
print(f"wrote {sum(len(v) for v in out.values() if isinstance(v, list))} cases")
