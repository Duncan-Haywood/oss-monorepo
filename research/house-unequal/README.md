# house-unequal: how far can the beam under a two-span joist sit from the middle of the house?

Follow-up to [`house-continuous`](../house-continuous) in track 12, open-source residential construction (`PROJECTS.md`; the "unequal spans" next step of `house-continuous`). A floor or ceiling joist lapped over a central beam or bearing wall is a two-span member, and a real house rarely has the beam exactly in the middle. The tool answers how much total width is lost when the beam moves off-centre, and how far off-centre it may sit for a given house width, with bending, shear, bearing and deflection all checked under pattern loading. Headline result: **a bending-governed floor joist loses little at first (0.4% of total width at a short/long span ratio of 0.9, 4.3% at 0.7, 13.3% at 0.5, 2x10 at 16 in), because the shorter span relieves the longer one; a deflection-governed ceiling joist loses about 5% for every 0.1 of ratio, because its long span stays at its deflection limit whatever the short span does.** Produced with AI assistance (Claude).

**Builds on.** `house-continuous`' finite-element `Beam` and `house-spans`' NDS allowable-stress base values, both imported. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Not a design.** Structure is life safety. This is research code, not reviewed by a licensed engineer, not checked against published span tables, and it shows nothing complies with a building code. A real member needs a licensed engineer's or architect's review, or the local code's prescriptive path, and a permit.

## Use it
```bash
cd research/house-unequal
PYTHONPATH=src:../house-continuous/src:../house-spans/src python -m house_unequal.cli --size 2x10 --case floor --spacing 16
PYTHONPATH=src:../house-continuous/src:../house-spans/src python -m house_unequal.cli --size 2x8 --case ceiling
```
For ratios of short to long clear span from 1.0 to 0.5, the output gives the longest total clear width, the two spans, and the governing check.

## Method (`src/house_unequal/model.py`)
- `house_continuous.model.Beam` already solves unequal spans; `house_continuous.model.check` takes one span length. `check` here takes a list of clear spans. Each span's design length is its clear span plus the 1.5 in end bearing, as in `house-continuous`.
- **Pattern loading.** Dead load on every span; live load on every subset of spans (4 patterns). Bending, shear (at distance d from each support face) and bearing take the worst pattern. Deflection is checked span by span against that span's own length over the limit, so the short span cannot hide behind the long one's length.
- `max_total` bisects the long span at a fixed ratio, so the answer is the longest total clear width at that ratio, exact to 0.01 ft. Allowables, size and repetitive factors, loads and cases are `house_spans.model`'s. Middle support bears over 3.5 in by default.
- Tests (9) check an end lifting off under live load on the long span only,  the equal-span case against `house-continuous` to 1e-9, a total width of twice the equal-span limit at ratio 1.0, the unequal two-span moment and reactions against the three-moment equation (M<sub>B</sub> = w(a&sup3; + b&sup3;)/(8(a + b))), monotone loss as the beam moves, mirror symmetry and the command line.

## Reproduce
```bash
cd research/house-unequal
python -m pytest -q tests                        # 9 tests, a couple of seconds
python experiments/run.py                        # about 10 s; writes experiments/results.txt
python experiments/figure.py                     # experiments/offcentre_loss.svg from results.txt
```

## Results (from `experiments/results.txt`; deterministic, SPF No. 2, spaced 16 in)
- **Bending-governed members forgive a small offset.** For the floor 2x10, 2x12 and snow-loaded 2x10 the total width at ratio 0.9 is 0.4% below the centred beam, at 0.8 1.8% below, at 0.7 4.3%, at 0.6 8.2% and at 0.5 13.3% (the three are within 0.1 point of each other, since bending scales alike). The long span meanwhile grows: floor 2x10, 15 ft 3 in centred, 17 ft 7 in at ratio 0.5. The short span carries the long span's moment as a back-span.
- **Deflection-governed members do not.** The ceiling 2x8 loses 5.1% of total width at ratio 0.9, 10.2% at 0.8, 15.1% at 0.7 and 24.1% at 0.5, and its long span stays at 22 ft 9 in to 23 ft 1 in throughout. The ceiling 2x6 behaves alike (5.4% to 24.4%). Centred, the 2x8 ceiling is a near tie: bending 0.994 and total deflection 0.982 at 22.8 ft per span.
- **How far off-centre?** For a 2x10 floor at 16 in the beam may sit up to 1.6 ft from the middle of a 30 ft wide house (spans 16 ft 7 in + 13 ft 4 in), 3.5 ft off a 28 ft house, 4.6 ft off a 26 ft house and 5.5 ft off a 24 ft house (a 17 ft 5 in + 6 ft 6 in split). A 30 ft 6 in wide house leaves no slack at all.
- **The short span's end can lift off.** With dead load on both spans and live load on the long span only, the end support of the short span goes into uplift in every pair tried (long span at its limit): floor 2x10 at 16 in, short span 10 ft, &minus;103 lb per joist; 8 ft, &minus;172 lb; 6 ft, &minus;271 lb; 4 ft, &minus;445 lb. Ceiling 2x8: &minus;64 lb at 10 ft, &minus;302 lb at 4 ft. Dead load is at full value (no 0.6 factor), so real uplift is larger. The joist needs a positive tie at that end, which is not modelled (`end_reaction_min_lb`; results section C).
- **Rule of thumb from this sweep:** put a bending-governed joist's beam anywhere in the middle third at no real cost; put a deflection-governed one (ceilings, light floors) near the middle, or pick the next size up.

## Limitations
- Two spans only. Each span's clear length plus bearing is its design length; a real lapped joist's splice, lap and the beam under it are not modelled. Beam deflection, settlement are not modelled, and uplift is reported (section C) but not checked against a connection.
- The 2x8 floor at ratios 0.6 and 0.5 is governed by live-load deflection, not bending; other sizes and spacings were not swept beyond the rows above (`house-continuous` covers 16 cells for equal spans).
- All the limits of `house-spans` and `house-continuous`: two species at one grade, DF-L values unchecked there, no vibration (often what governs a real floor), no point loads, no notches, no creep. The numbers have not been compared with the AWC or ICC tables, which this project did not read.

## Next steps
Model the beam under the joists, so the beam's own size sets the offset penalty. Feed the unequal-span option to `house-plan`'s framing search. Floor vibration. Compare with published tables.

## Owner steps
None required. A licensed engineer's review of any member before a house is built is an owner step.

## Outside dependencies (vitamins)
Python, pytest, and `house-spans`' NDS base values, size factors and loads, which come from outside the model.

## References
- Hibbeler, R. C. *Structural Analysis* (continuous beams, three-moment equation), the standard textbook source of the closed form the test uses. The formula was derived and checked in the test; the book was not read for this run.
- American Wood Council, *National Design Specification for Wood Construction*, sections as cited in [`house-spans`](../house-spans) (not re-read).
- [`research/house-continuous`](../house-continuous) and [`research/house-spans`](../house-spans), this repository.
