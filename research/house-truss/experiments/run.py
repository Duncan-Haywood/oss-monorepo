"""Experiments for house-truss. Deterministic, a few seconds.

    PYTHONPATH=src:../house-spans/src:../house-framing/src python experiments/run.py   # writes results.txt
"""
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
for rel in ("src", "../house-spans/src", "../house-framing/src"):
    sys.path.insert(0, str((HERE.parent / rel).resolve()))
from house_truss.model import Truss, bf_per_sf, board_feet, checks, lightest, stick_frame  # noqa: E402

out = []
def p(s=""):
    out.append(s)
p("house-truss experiments (SPF No. 2, pin-jointed W truss, 4/12 unless stated; lumber in nominal board feet, no waste, plates excluded)")
p()
p("A. Lightest passing truss at 24 in o.c. versus stick framing (rafters + ceiling joists at 16 in), 30 psf snow")
p(f"{'span_ft':>8} {'top':>5} {'bottom':>7} {'web':>5} {'truss_bf':>9} {'truss_bf/sf':>12} {'rafter':>7} {'joist':>6} {'stick_bf/sf':>12} {'saving_%':>9}")
rows = {}
for snow in (30, 50):
    for span in (12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32):
        best = lightest(float(span), snow_psf=snow)
        st = stick_frame(float(span), case=f"roof-snow{snow}")
        rows[(snow, span)] = (best, st)
        if snow == 30:
            if best is None or st is None:
                p(f"{span:>8} " + ("no 2x4-2x8 W truss passes" if best is None else "") + ("  no stick passes" if st is None else ""))
                continue
            t, bf = best
            sv = 100 * (1 - bf_per_sf(t) / st["bf_per_sf"])
            p(f"{span:>8} {t.top:>5} {t.bottom:>7} {t.web:>5} {bf:>9.1f} {bf_per_sf(t):>12.3f} {st['rafter']:>7} {st['joist']:>6} {st['bf_per_sf']:>12.3f} {sv:>9.1f}")
p()
p("B. Same, 50 psf snow")
for span in (12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32):
    best, st = rows[(50, span)]
    if best is None or st is None:
        p(f"{span:>8} " + ("no 2x4-2x8 W truss passes" if best is None else "") + ("  no stick passes" if st is None else ""))
        continue
    t, bf = best
    sv = 100 * (1 - bf_per_sf(t) / st["bf_per_sf"])
    p(f"{span:>8} {t.top} {t.bottom} {t.web} {bf:>6.1f} bf {bf_per_sf(t):.3f} bf/sf  stick {st['rafter']}+{st['joist']} {st['bf_per_sf']:.3f}  saving {sv:.1f}%")
p()
p("C. What governs the 24 ft truss (30 psf snow): demand/capacity ratio per member group, by chord size")
p(f"{'top':>5} {'bottom':>7} {'top_chord':>10} {'bottom_chord':>13} {'web':>6} {'deflect':>8}")
for top, bottom in (("2x4", "2x4"), ("2x6", "2x4"), ("2x6", "2x6"), ("2x8", "2x6")):
    r, _ = checks(Truss(top=top, bottom=bottom))
    p(f"{top:>5} {bottom:>7} {r['top chord']:>10.2f} {r['bottom chord']:>13.2f} {r['web']:>6.2f} {r['deflection']:>8.2f}")
p()
p("D. Pitch at a 24 ft span, 30 psf snow: steeper roofs cut chord force but lengthen the chords")
for pitch in (3, 4, 6, 8, 12):
    best = lightest(24.0, pitch=float(pitch))
    if best is None:
        p(f"  {pitch}/12: none passes"); continue
    t, bf = best
    p(f"  {pitch}/12: top {t.top}, bottom {t.bottom}, web {t.web}, {bf:.1f} bf, {bf_per_sf(t):.3f} bf/sf")
p()
p("E. Truss spacing at a 24 ft span, 4/12, 30 psf snow")
for sp in (16, 19.2, 24):
    best = lightest(24.0, spacing_in=sp)
    t, bf = best
    p(f"  {sp} in: top {t.top}, bottom {t.bottom}, web {t.web}, {bf:.1f} bf, {bf_per_sf(t):.3f} bf/sf")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
