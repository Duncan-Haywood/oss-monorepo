"""Experiments for house-composite. Deterministic; writes experiments/results.txt.

    PYTHONPATH=src:../house-spans/src:../house-vibration/src python experiments/run.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for p_ in ("src", "../house-spans/src", "../house-vibration/src"):
    sys.path.insert(0, str(HERE.parent / p_))
from house_spans.model import Member, board_feet_per_sf  # noqa: E402
from house_composite.model import cheapest, frequency_hz, max_span  # noqa: E402
from house_vibration.model import cheapest as bare_cheapest, frequency_hz as bare_f, max_span as bare_span  # noqa: E402

GAMMAS = (0.0, 0.25, 0.5, 0.75, 1.0)
out = []


def p(s=""):
    out.append(s)


def fi(ft):
    n = int(ft * 12)
    return f"{n // 12}'{n % 12:>2}\""


p("house-composite experiments (SPF No. 2 floor joists, 10 psf dead + 40 psf live; 23/32 in subfloor; strength and deflection joist-alone)")
p("gamma = composite efficiency (0 = loose panel, 1 = rigid glued T-beam); panel modulus E_p and gamma are swept assumptions, not sourced values")
p()
p("A. First natural frequency (Hz) of a 2x10 at 16 in, 15 ft clear span, by gamma and panel modulus (bare joist: %.2f Hz)" % bare_f(Member("2x10"), 15))
p("  E_p (psi)   " + "".join(f"{g:>8g}" for g in GAMMAS))
for ep in (0.25e6, 0.5e6, 1.0e6):
    p(f"  {ep:>9.2e} " + "".join(f"{frequency_hz(Member('2x10'), 15, panel_e_psi=ep, gamma=g):>8.2f}" for g in GAMMAS))
p()
p("B. Maximum clear span (ft-in) of a 2x10 at 16 in under a 12 Hz and a 15 Hz limit (E_p 0.5e6; bare joist in the first column)")
p("  limit    bare " + "".join(f"{g:>8g}" for g in GAMMAS))
for lim in (12, 15):
    m = Member("2x10")
    p(f"  {lim:>3}Hz {fi(bare_span(m, lim)):>8}" + "".join(f"{fi(max_span(m, lim, gamma=g)):>8}" for g in GAMMAS))
p()
p("C. Least lumber that passes at 15 Hz (board feet per sq ft), cheapest size and spacing, E_p 0.5e6")
p("  span   bare" + "".join(f"{('g=%g' % g):>15}" for g in GAMMAS))
for span in (10, 12, 14, 16):
    b = bare_cheapest(span, 15)
    row = f"  {span:>2} ft {(f'{b[1]}@{b[2]:g} {b[0]:.2f}' if b else 'none'):>12}"
    for g in GAMMAS:
        c = cheapest(span, 15, gamma=g)
        row += f"{(f'{c[1]}@{c[2]:g} {c[0]:.2f}' if c else 'none'):>15}"
    p(row)
p()
p("D. Maximum clear span (decimal ft) of a 2x10 at 16 in against the frequency limit, by gamma (E_p 0.5e6)")
p("  limit_Hz   bare" + "".join(f"{('g=%g' % g):>8}" for g in (0.0, 0.5, 1.0)))
for l in range(0, 21, 2):
    m = Member("2x10")
    p(f"  {l:>6} {bare_span(m, l):>8.2f}" + "".join(f"{max_span(m, l, gamma=g):>8.2f}" for g in (0.0, 0.5, 1.0)))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
