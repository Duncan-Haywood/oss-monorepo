# Window and Door Design Pressure Calculator

A free browser tool for window and door dealers, installers, builders and permit-plan preparers: **type the wind
speed and describe the building, paste the opening schedule, and get for every window, door and garage door its
ASCE 7-16 wall zone, the positive and negative wind pressures, and the DP rating it needs**, with the topographic
factor, ground elevation and wind-borne debris region checked and every factor tied to its section. Nothing is
uploaded.

**Live tool:** https://marisstella.app/window-design-pressure-calculator/ ·
**Guide:** [what DP rating do my windows need, worked through](what-dp-rating-do-my-windows-need.html)

After using this, you can **answer "provide design pressures for all exterior openings" opening by opening instead
of quoting one worst-case DP for the house**: in the built-in example (140 mph, exposure C, h = 22 ft, 32 ft deep)
the needs run from DP 27.2 for a sliding door mid-wall to DP 37.3 for a small transom near a corner, and the
debris-region check shows each would need about 9 psf more if the glazing is not protected.

## Model (`calc.mjs`)

ASCE/SEI 7-16 (adopted by IBC and IRC 2018 and 2021), Chapter 30 Part 1, h ≤ 60 ft:

- qh = 0.00256 Kh Kzt Kd Ke V² (Eq. 26.10-1); Kh = 2.01 (z/zg)^(2/α), z ≥ 15 ft, α and zg from Table 26.11-1;
  Kd = 0.85 (Table 26.6-1); Ke = e^(−0.0000362 zg) (Table 26.9-1, 1.0 when blank).
- Kzt = (1 + K1 K2 K3)² from Figure 26.8-1 for a 2-D ridge, 2-D escarpment or 3-D hill, with the Section 26.8.1
  height (15 ft, 60 ft in exposure B) and H/Lh ≥ 0.2 conditions and the H/Lh > 0.5 cap (Lh = 2H).
- Wall (GCp) from Figure 30.3-1 at 10 and 500 ft², linear in log A, reduced 10% for roof slopes ≤ 10°;
  zone 5 within a = min(0.1 least dimension, 0.4h) ≥ max(0.04 least dimension, 3 ft) of a corner.
- p = qh [(GCp) − (GCpi)] (Eq. 30.3-1), (GCpi) ±0.18 or ±0.55 (Table 26.13-1), at least 16 psf (Section 30.2.2).
- Required DP = max(0.6 p+, 0.6 |p−|) rounded up to 0.1 psf, the ASD level window and door ratings are compared with.
- Wind-borne debris region (Section 26.12.3.1): V ≥ 140 mph, or V ≥ 130 mph within 1 mile of the coast.

Not modelled: looking up V, ASCE 7-22 (IBC/IRC 2024), h > 60 ft (Part 3), open buildings, roof openings,
the effective-width rule for long narrow units (the plain area is used, conservative), IRC Table R301.2.1(1),
impact testing and product approvals.

**Spec sources:** ASCE/SEI 7-16, *Minimum Design Loads and Associated Criteria for Buildings and Other
Structures*, Chapters 26 and 30; the professional who would sign it off is a licensed structural engineer.
**Unverified:** every equation is checked against a hand calculation written out in `calc.test.mjs`, and Kz
against the rounded values printed in Table 26.10-1, not against a commercial program or a sealed calculation.
The source text could not be fetched from this session; coefficients are from the standard as published.

## Files

- `index.html`: the tool. `calc.mjs`: the engine. `usage.mjs`: on-device counters with opt-out.
- `what-dp-rating-do-my-windows-need.html`: the worked example, its numbers checked against the engine in
  `page.test.mjs`.

## Run

    node --test calc.test.mjs page.test.mjs usage.test.mjs

## No warranty

Free and as-is, MIT licensed. Not engineering, legal or code-compliance advice; the design pressures are set by
the engineer of record or the building official.
