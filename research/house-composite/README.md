# house-composite: how much of a floor-vibration penalty does the subfloor's T-beam action recover?

[`house-vibration`](../house-vibration) found that a floor-frequency limit above about 12 Hz shortens the span of a joist, and said its joist-alone model "underrates" the stiffening from the subfloor. This project adds that stiffening: the subfloor panel acts as a partial flange of a T-beam, by the gamma method, and the frequency limit is re-swept. Track 12, open-source residential construction (`PROJECTS.md`). Produced with AI assistance (Claude).

**Headline.** For a 2x10 SPF No. 2 joist at 16 in with a 23/32 in subfloor, whether composite action matters depends entirely on two assumed numbers that this project does not source: the panel's stiffness along the joist span and the efficiency gamma of the panel-to-joist connection. With a panel modulus of 0.5 million psi, the first-mode frequency of a 15 ft span rises from 10.5 Hz (joist alone) to 11.7 Hz at gamma 0.25, 12.6 Hz at 0.5 and 14.0 Hz at 1 (a rigid glued T-beam). Under a 15 Hz limit the 2x10 at 16 in span grows from 12 ft 6 in to between 13 ft 2 in and 14 ft 6 in, and the least-lumber joist for a 14 ft span goes from 2x12 at 16 in (1.50 board feet per sq ft) to 2x12 at 24 in (1.00) once gamma reaches 0.5. At gamma 0 the result is the `house-vibration` one, as it must be. Up to 10 Hz nothing changes at any gamma.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-composite/

**Builds on.** `house-vibration` (frequency form, 10 psf dead mass) and `house-spans` (NDS checks, species values, board-feet measure), imported from `../house-vibration/src` and `../house-spans/src`. Method: the gamma method for mechanically jointed beams (Moehler), as standardised in Eurocode 5 (EN 1995-1-1, Annex B); the formula here is rederived from the parallel-axis theorem and checked in tests, not copied. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Not a design.** Structure is life safety. This is research code, not reviewed by a licensed engineer, and it does not show that any floor is acceptable to occupants or complies with a code. See the `house-spans` README.

## Method (`src/house_composite/model.py`)
- EI = E<sub>w</sub>I<sub>w</sub> + E<sub>f</sub>I<sub>f</sub> + E<sub>w</sub>A<sub>w</sub>a<sub>w</sub><sup>2</sup> + &gamma;E<sub>f</sub>A<sub>f</sub>a<sub>f</sub><sup>2</sup>, web = joist, flange = a strip of subfloor one joist spacing wide, with a<sub>w</sub> + a<sub>f</sub> the distance between the two centroids and &gamma;E<sub>f</sub>A<sub>f</sub>a<sub>f</sub> = E<sub>w</sub>A<sub>w</sub>a<sub>w</sub>.
- Tests: &gamma; = 1 equals an independent transformed-section T-beam calculation to 12 digits; &gamma; = 0 equals the sum of the two separate stiffnesses and its frequency is within 1% of `house-vibration`'s; stiffness rises with &gamma; and with panel modulus; a narrower flange is less stiff.
- Frequency f<sub>1</sub> = (&pi;/2L<sup>2</sup>)&radic;(EI g / w) with the joist's 10 psf dead mass, as in `house-vibration`. Strength and deflection checks stay joist-alone, which is conservative.
- Panel modulus (0.25, 0.5, 1.0 million psi) and &gamma; (0 to 1) are **swept assumptions**. No panel-rating value or code table was read or copied, and nobody here measured a connection.

## Reproduce
```bash
pip install pytest
cd research/house-composite
python -m pytest -q tests                                                           # 6 tests
PYTHONPATH=src:../house-spans/src:../house-vibration/src python experiments/run.py  # under a second; writes experiments/results.txt
python experiments/figure.py                                                        # experiments/span_vs_frequency.svg
```

## Results (from `experiments/results.txt`; deterministic)
- **A.** 2x10 at 16 in, 15 ft: 10.5 Hz bare. At panel modulus 0.25, 0.5, 1.0 million psi the frequency at gamma 1 is 12.6, 14.0 and 15.9 Hz, and at gamma 0.5 it is 11.7, 12.6 and 14.0 Hz.
- **B and D (figure).** At 12 Hz, bare 13 ft 11 in becomes 15 ft 3 in (the strength limit) from gamma 0.5 up. At 15 Hz it becomes 13 ft 8 in at gamma 0.5 and 14 ft 6 in at gamma 1.
- **C.** At 15 Hz the least lumber for 16 ft is "none" for a bare joist and 2x12 at 12 in (2.00) to 2x12 at 16 in (1.50) with composite action; for 12 ft, 2x12 at 24 in (1.00) falls to 2x10 at 24 in (0.83).

## Limitations
- **The two inputs that decide the result are assumed, not measured.** A glued-and-nailed subfloor is close to gamma 1 at small deflection, a nailed-only one is much lower, and a panel's stiffness along the span depends on its grade and strength axis; real subfloor joints also have gaps. Read the tables as "if gamma is this", not as a prediction.
- Flange width is the full spacing (a narrower width is a parameter, see tests), a single simple span, one species and grade, and only first-mode frequency: no point-load deflection, damping, live mass or topping. The live-load mass left out lowers real frequencies, so the gains are optimistic by an amount not measured here.
- Not validated against a measured floor. Stylised.

## Next steps
Add a point-load deflection criterion; find a licensed or open measured-floor dataset to calibrate gamma and the panel modulus; feed the frequency check into `house-plan`'s framing takeoff.
