# garment-optics: how much conductive yarn does an RF-shielding fabric need, and how fast does breakage ruin it?

Eighth milestone of the engineered-clothing track (`PROJECTS.md`, track 6), **RF-shielding part only**. The milestone also lists structural colour, infrared signature and adversarial patterns against person detectors; those are not done here (see Next steps). A stylised plane-wave model of a square weave of conductive yarn: sheet resistance, shielding effectiveness (SE), a high-frequency aperture bound, areal metal mass, and a Monte Carlo of random yarn breakage. Everything is a model on a CPU; no fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-optics/

**Builds on.** The standard thin-sheet reflection-loss and slot-aperture shielding formulas of EMC engineering (e.g. Paul, *Introduction to Electromagnetic Compatibility*, 2nd ed., Wiley, 2006) and the idea of metallised textile shielding. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. **Citation check.** The Paul book entry is from memory and was not re-checked in this run (no network lookup of bibliographic records). I use only the two textbook formulas below, recalled and not verified against a measurement.

## Method (`src/garment_optics/model.py`)
- Yarn resistance per metre `R'` from conductivity and cross-section (solid wire, or a thin metal coating of thickness t on a non-conductive core, area pi d t).
- Square weave, both directions, ideal contact at crossings: sheet resistance `Rs = R' p`.
- SE of a thin sheet: `20 log10(1 + Z0 / (2 Rs))`, Z0 = 376.73 ohm. Aperture bound: `20 log10(lambda / (2 g))`, gap `g = p - d`. The reported fabric SE is the **smaller** of the two, a conservative combination that is my simplification.
- Metal areal mass `2 rho A / p`, ignoring crimp and crossings.
- Breakage: an n x n resistor grid (nodes = crossings, unit-resistor segments), each segment removed with probability f, solved by sparse linear algebra with bus bars on two sides; compared with the effective-medium estimate `1/(1-2f)`.
- Material constants (Cu, Ag, 316 stainless conductivity and density) are handbook values recalled from memory, not sourced. **No prices are given**: I have no dated, cited price source, so cost is left to an owner step.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-optics
python3 -m pytest -q tests          # 8 tests
python3 experiments/run.py          # seconds; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- Sheet resistance needed: 30 dB needs about 6.2 ohm/sq, 40 dB 1.9, 60 dB 0.19.
- Every design tried has a sheet SE of 54 to 87 dB, far above the target. **The aperture bound is what limits them**: at 2.4 GHz a 1 mm pitch gives 36.4 dB, 0.3 mm gives 48 to 50 dB; at 28 GHz the 1 mm designs fall to about 15 dB. So pitch, not yarn conductivity, sets SE above ~1 GHz. (Whether the aperture bound is too pessimistic for a woven mesh whose gaps are not slots is untested here.)
- Mass: 1 um of silver on 100 um nylon at 1 mm pitch is 6.6 g/m2 of silver and gives 36.8 dB at 2.4 GHz (model); 0.2 um at 0.5 mm pitch is 2.6 g/m2 and 43.9 dB. Solid 50 um wire at 1 mm pitch is 31 to 35 g/m2 for similar SE.
- Breakage: on a 30 x 30 grid the median effective sheet resistance follows the effective-medium estimate `1/(1-2f)` to within a few percent up to f = 0.3 (2.55 vs 2.50) and exceeds it near the threshold (5.8 vs 5.0 at 0.4); at f = 0.5, 13 of 20 draws had no conducting path and by 0.6 all 20 did not (bond percolation threshold of the square lattice is 1/2). In dB, with breaks on stainless 50 um @0.3 mm, the sheet SE drops 64.4 to 48.3 dB at 40% broken segments, but the aperture bound (which ignores breaks) still dominates, so **modelled SE degrades gracefully until near the threshold, then collapses**.

## Limitations
Plane wave at normal incidence, far field; ideal crossing contacts (real crossings add contact resistance, the dominant practical issue); no yarn crimp, weave thickness, body proximity, near-field sources, seams, wash ageing or stretch; breakage is independent per segment, whereas real breaks are correlated by flex. The `min` combination is not validated. No result here is a claim about any real fabric.

## Next steps
Add contact resistance at crossings and a sheet-plus-aperture model checked against a published measurement; structural colour (thin-film transfer matrix), infrared signature (extend `garment-thermal`'s emissivity), and adversarial patterns tested on open person detectors in rendered scenes (privacy research only, per the track guardrails).

## Owner steps
Measuring SE of a fabric swatch (a shielded-box or ASTM D4935-style coaxial test) is an owner step and would ground the model. Cost at about $300 / $1,000 / $3,000 builds needs sourced, dated material prices, not collected here.

## Outside dependencies (vitamins)
Python, numpy, scipy. Conductivities, densities and the EMC formulas come from outside the model.

## References
- Paul, C. R. (2006). *Introduction to Electromagnetic Compatibility*, 2nd ed. Wiley. (Not re-checked in this run.)
