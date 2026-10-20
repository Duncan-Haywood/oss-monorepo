# capture-sentinel: where in a camera ring should the sentinel go when the subject faces a favourite direction?

Eighth project of track 13, autonomous multi-angle capture for travel creators (`PROJECTS.md`; the third "Next step" of `capture-wake`). One sentinel camera can wake the rest of a rig, but a camera sees a face better than a back, so where it stands matters. This project models that with **assumed detector figures** (not measured) and a subject whose facing at each moment is random around a favourite direction (a view, a landmark, the way they are walking). **Headline:** in a four-camera ring with moderate concentration (von Mises kappa 2), the sentinel at the favourite direction misses 8.6% of moments, the one on the opposite side 34.4%, and a sentinel rotated through the ring 21.5%. When the subject has no favourite direction, position is irrelevant (21.5% everywhere). A second finding corrects `capture-wake`: misses of cameras spread around a subject are *anti*-correlated (turned away from one, facing another), so independent misses overstate the chance that every detector misses by about 2x on a ring of four, while for four cameras clustered within 30 degrees the correlation is positive and independence understates it about 12x. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/capture-sentinel/

**Builds on.** `capture-wake` (sentinel against any-of-N, same standby figures), `capture-rig` (ring geometry) and `capture-trigger`. No paper is reproduced; the von Mises distribution is the standard circular analogue of the normal. No lab in `prompt.md` covers this, and none is claimed.

## Method (`src/capture_sentinel/model.py`)
- **Ring.** N cameras at equal azimuths around the subject, camera 0 at the favourite facing direction.
- **Detector (assumed).** Miss probability 0.03 when the subject faces the camera, 0.40 when facing directly away, rising as (1 - cos of the bearing)/2 between.
- **Facing.** Each moment the subject faces von Mises(0, kappa): kappa 0 is any direction, larger kappa concentrates on the favourite one.
- **Closed form.** A camera at bearing theta has mean miss `m_f + (m_b - m_f)(1 - A(kappa) cos theta)/2` with `A = I1/I0`; the chance that every camera in a set misses is a numerical integral over the facing angle. A simulation of 40,000 moments checks both.
- **Energy.** A simplified form of `capture-wake`'s closed form (standby 0.9 W, recording 5 W, 2 false alarms an hour per detector, 15 s hold; no latency or pre-roll term), used only to compare detector counts.

## Reproduce
```
cd research/capture-sentinel
python3 -m pytest -q
python3 experiments/run.py      # writes experiments/results.txt
python3 experiments/figure.py   # writes experiments/miss.svg
```

## Results (`experiments/results.txt`; kappa 2 unless stated)
| Placement in a ring of 4 | share of moments that wake the rig | rig Wh over 16 h |
|---|---|---|
| best sentinel (faces favourite direction) | 0.914 | 77.8 |
| worst sentinel (opposite side) | 0.656 | 72.7 |
| rotating sentinel | 0.785 | 75.2 |
| any of 4 listening | 0.999 | 86.0 |

- Closed form against simulation agree within 0.4 points at every bearing (table A).
- The best sentinel's advantage over the worst grows with kappa: 0.215 against 0.215 at kappa 0, 0.086 against 0.344 at kappa 2, 0.042 against 0.388 at kappa 8 (table B).
- Probability every listening camera misses, shared facing against independent (table C): ring of 4, 0.0007 against 0.0014 (ratio 0.51); ring of 8, ratio 0.25; three cameras across a 90 degree front arc, ratio 1.65; four within 30 degrees, ratio 12.
- Any-of-N cuts the miss from 8.6% to 0.07% on a ring of four, for three extra detectors' false alarms (8 Wh more than the best sentinel here).

## Limitations
- The cosine miss model and every detector figure are assumed; no footage was analysed. Real detectors depend on distance, occlusion, light and sound, which are not modelled.
- Facing is the only source of correlation; a noisy moment (loud crowd) that hides the subject from every camera is the `common` term in `capture-wake`, not included here, so absolute any-of-N misses are optimistic.
- Cameras are at equal range on a flat ring; the favourite direction is known in advance and fixed.
- The energy comparison is a simplified model and not a battery sizing.

## Next steps
- Estimate the miss-by-bearing curve from footage with the `capture-bystander` or `capture-edit` detectors at several camera angles.
- Let the sentinel role move: hand it to whichever camera currently has the best view of the subject, and cost the radio traffic.
- Combine with the `common` miss term of `capture-wake`.

## Owner steps
Film a real subject from several bearings and measure how often a trigger fires at each before relying on any figure here.

## Outside dependencies
None. Python standard library only; pytest for the tests.
