# How far can an underwater vehicle dead-reckon before it must surface? DVL drift per kilometre

**Status: preliminary, simulation only; milestone 6 of track 23 (`marine-dr`), a sub-study of the
[`marine-hull`](../marine-hull/PROPOSAL.md) programme.** An AUV with a Doppler velocity log (DVL) and a
heading reference drifts a computable fraction of the distance it travels. The heading reference, not the
DVL, sets the drift unless it is better than about 0.1 degree.

**Live page:** https://marisstella.app/research/marine-dr/

## Result

- Drift per metre travelled on a straight track is `sqrt(s^2 + (2 sin(b/2))^2)` for DVL scale error `s`
  and heading bias `b`. The simulation matches it within 1% (`tests/test_dr.py`).
- With the Teledyne Workhorse Navigator 600 bottom-track accuracy (+-0.2%, taken as a 1-sigma scale error),
  1 degree of heading bias gives 1.75% drift, 8.7 times the DVL's own; the two are equal at 0.115 degree.
- Distance to reach a 10 m error: 3.8 km for 0.2% scale and 0.1 degree; 1.1 km for 0.5 degree; 0.57 km for
  1 degree (table in [`experiments/results.txt`](experiments/results.txt)).
- Monte Carlo, 20 km, 200 runs (scale sd 0.2%, bias sd 0.1 degree, gyro random walk 5e-5 rad/sqrt(s)):
  no fix gives a median worst error of 64 m (95th percentile 178 m). A surface fix of 3 m sd every 2 km cuts
  it to 15 m, every 1 km to 11 m. Every 0.5 km gives 9.6 m, the fix-noise floor, so more frequent fixes buy nothing.

## Reproduce

```bash
cd research/marine-dr
PYTHONPATH=src python3 -m pytest tests -q            # 5 tests
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt
```

## Sources and limitations

DVL accuracy: Teledyne RDI Workhorse Navigator datasheet, +-0.4% +-0.2 cm/s (300 kHz) and +-0.2% +-0.1 cm/s
(600/1200 kHz), via the [BODC copy](https://www.bodc.ac.uk/data/documents/nodb/pdf/rdi_workhorse_nav_ds_lr.pdf);
read from a search excerpt, the PDF was not opened. Heading bias, gyro random walk (about 0.17 deg/sqrt(h)) and the
3 m fix sd are assumed and swept. Straight track only; no currents, DVL dropouts, USBL or surfacing energy.
A first Monte Carlo with an unrealistically large gyro random walk was discarded (see `LOG.md`).

Related: [`marine-hull`](../marine-hull/README.md), [`marine-path`](../marine-path/README.md), `gnss-twin`, `doppler-twin`.
Next: turns, a USBL aid, surfacing energy. AI-assisted (Claude Code).
