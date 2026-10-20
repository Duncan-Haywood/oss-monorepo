# house-vibration: does a floor-vibration frequency limit erase the lumber saved by deep, widely spaced joists?

This adds a floor-vibration check to [`house-spans`](../house-spans), whose "least lumber" result (a deep joist at 24 in beats 2x10 at 16 in by 20% to 50%) said plainly that it ignored vibration, "which in practice is why builders use 16 in". This project asks how much of that saving survives a minimum natural frequency. Track 12, open-source residential construction (`PROJECTS.md`). Produced with AI assistance (Claude).

**Headline.** For SPF No. 2 floor joists (10 psf dead + 40 psf live), **any frequency limit up to 10 Hz changes nothing**: the longest 2x10 at 16 in that passes strength and deflection (15 ft 3 in) vibrates at 10.1 Hz. At 12 Hz it shortens to 13 ft 11 in; at 15 Hz the least-lumber joist for a 12 ft span moves from 2x10 at 24 in (0.83 board feet per sq ft) to 2x12 at 24 in (1.00), and for 14 ft from 2x12 at 24 in (1.00) to 2x12 at 16 in (1.50). Whether vibration "erases the saving" is therefore a question about which limit you adopt, and this project does not claim one.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-vibration/

**Builds on.** `house-spans` (NDS checks, loads, species values, board-feet measure), imported from `../house-spans/src`. Beam vibration theory (first mode of a simply supported Euler-Bernoulli beam). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Not a design.** Structure is life safety. This is research code, not reviewed by a licensed engineer, and it does not show that any floor is acceptable to occupants or complies with a code. See the `house-spans` README.

## Method (`src/house_vibration/model.py`)
- First natural frequency f<sub>1</sub> = (&pi;/2L<sup>2</sup>)&radic;(EI g / w), L the design span (clear span + 1.5 in bearing), w the **dead** load per inch of joist (10 psf times the spacing), EI the joist alone.
- A test confirms the identity f<sub>1</sub> = (&pi;/2)&radic;(5g / 384&delta;) with &delta; the static midspan deflection under that weight, and the hand value for a 2x10 at 16 in.
- A joist passes if every `house-spans` check passes **and** f<sub>1</sub> is at least the limit. Frequency falls with span as the other ratios rise, so `max_span` bisects exactly. `cheapest` scans size and spacing for the least board feet per square foot.
- The limit (Hz) is swept from 0 to 20. No code-book vibration criterion was read or copied; the 8 to 15 Hz range is a sweep, not a recommendation.

## Reproduce
```bash
pip install pytest
cd research/house-vibration
python -m pytest -q tests                                          # 6 tests
PYTHONPATH=src:../house-spans/src python experiments/run.py        # under a second; writes experiments/results.txt
python experiments/figure.py                                       # experiments/span_vs_frequency.svg
```

## Results (from `experiments/results.txt`; deterministic)
- **A.** The longest strength-passing joists have first modes of 8.7 to 13.6 Hz; 2x10 and 2x12 at 24 in reach 12.4 Hz, 2x6 at 24 in 13.6 Hz.
- **B and E (figure).** 2x10 at 16 in: 15 ft 3 in up to 10 Hz, 13 ft 11 in at 12 Hz, 12 ft 6 in at 15 Hz. 2x10 at 24 in is flat to 12 Hz (12 ft 5 in) because at its strength-limited span of 12 ft 5 in it already vibrates at 12.4 Hz (A); it falls to 11 ft 3 in at 15 Hz.
- **C and D.** The saving of the cheapest joist over 2x10 at 16 in is the same at every limit up to 12 Hz for 8 to 12 ft spans (50%, 47%, 33%); at 14 ft it is 20% up to 10 Hz and undefined at 12 Hz, where 2x10 at 16 in itself no longer passes. At 15 Hz the 10 ft saving falls from 47% to 33% and the 12 ft saving from 33% to 20%. At 16 ft nothing passes at 15 Hz.

## Limitations
- **Joist only.** A real floor's subfloor and its composite action stiffen it and raise the frequency; this model underrates that. Live-load mass (people, furniture) and damping lower and change real behaviour; this model leaves them out. The two errors do not cancel by any measured amount here.
- Frequency is a crude proxy for occupant comfort; point-load deflection and damping govern in published criteria that were not read for this project.
- Single simple span, one species and grade (SPF No. 2), one load case. Not validated against any measured floor or published table.
- Stylised; every result depends on the limit assumed.

## Next steps
Add the subfloor composite stiffness, and a point-load deflection criterion; compare with a measured-floor dataset if a licensed one exists; feed the frequency check into `house-plan`'s framing takeoff.

## Owner steps
None required. A licensed engineer's review is required before anyone builds from this.

## References
- Euler-Bernoulli beam theory, first mode of a simply supported beam, f<sub>1</sub> = (&pi;/2L<sup>2</sup>)&radic;(EI/m). Standard result; checked here by the test against the static-deflection form.
- `house-spans` and its references (NDS, ASCE 7).
