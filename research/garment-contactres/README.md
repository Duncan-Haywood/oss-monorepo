# garment-contactres: does contact resistance at yarn crossings matter for an RF-shielding fabric?

Follow-up to the "contact resistance at crossings" next step of [`garment-optics`](../garment-optics). A two-layer resistor-network model of a woven conductive fabric: warp and weft yarns touch only through a contact resistor at each crossing, and yarn segments break at random. Everything is a model on a CPU; no fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-contactres/

**Builds on.** `research/garment-optics` in this repository (its one-layer grid, where every crossing was a single node, i.e. zero contact resistance, and its thin-sheet shielding formula, which cites Paul, *Introduction to Electromagnetic Compatibility*, 2nd ed., Wiley, 2006; that entry was not re-checked there or here). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. No new external source is used, so there are no new citations to check.

## Method (`src/garment_contactres/model.py`)
- Every crossing has a weft node and a warp node joined by a resistor `rc`. Yarn segments between neighbouring crossings have resistance 1 (the unit), so `rc` is the contact resistance as a multiple of one segment's resistance. Each yarn segment is removed independently with probability `f`; contacts never break.
- Bus bars hold the left weft ends at 1 V and the right weft ends at 0 V; warp ends are open. Effective sheet resistance is `R_total * n / (n - 1)` for an n x n fabric, in units of one segment. Components not connected to both bars are dropped; a draw with no path is "open".
- Sheet resistance is turned into shielding by the same thin-sheet formula as `garment-optics`, `20 log10(1 + Z0 / (2 Rs))`. The aperture limit is not included here.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-contactres
python3 -m pytest -q tests          # 7 tests
python3 experiments/run.py          # about 3 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; 30 x 30 fabric, 20 draws per cell, seed 0)
- **On an intact fabric contact resistance has no effect at all.** The sheet resistance is exactly one segment for every `rc` from 0 to 100 (a unit test checks this). By symmetry the warp layer carries no net current when no yarn is broken, so the contacts carry none either.
- **It matters only once yarns break**, because warp yarns then provide the bypass around a broken weft segment, and each bypass costs two contacts. The median effective resistance, relative to one segment, at 20% broken: 1.74 (rc = 0), 2.11 (rc = 1), 4.07 (rc = 10), 16.7 (rc = 100). At 30% broken: 2.62, 3.51, 8.60, 51.1.
- Contacts a tenth of a segment cost almost nothing (a 1 to 4% rise for 10 to 40% broken). Contacts equal to a segment raise the median by 11 to 40%. Contacts ten segments each raise it 1.6 to 4.4 times.
- At 50% broken, 10 of 20 draws are open at every `rc` (the bond percolation threshold, as in `garment-optics`), and the median of the remaining draws is dominated by a few thin paths. Treat the f = 0.5 row as indicative only.
- In dB for one stylised design (316 stainless, 50 um wire, 0.3 mm pitch; one segment is 0.113 ohm, conductivity recalled from memory and not sourced): with 20% of segments broken the sheet shielding is 59.6 dB with perfect contacts, 57.9 dB with contacts equal to one segment (0.113 ohm), 52.3 dB at ten segments (1.13 ohm) and 40.1 dB at a hundred segments (11.3 ohm), against 64.4 dB intact. The 0.113 ohm and 1.13 ohm figures are the model's, not measured contact resistances.
- Cross-check: at rc = 0 the median at 30% broken is 2.62 here against 2.55 in `garment-optics`. Same network, different random number order and draws; consistent with sampling noise at 20 draws, but I did not test that.

## Limitations
- The contact values are a sweep over a ratio, not measurements. I have no sourced figure for the contact resistance of real yarn crossings (silver-coated or steel), so I make no claim about which row a real fabric sits in. This is the main gap: the sheet-plus-aperture check against a published measurement listed in `garment-optics`'s next steps is **not done**.
- Square lattice, identical segments, independent breaks, contacts that never break or change under strain, one fabric size, 20 draws, no confidence intervals. No yarn crimp, no pressure-dependent contact, no near field, no aperture term in the dB figures. Plane-wave thin-sheet formula as in `garment-optics`.
- A fabric with a conductive coating has contact resistance that depends on coating wear; this model has a single fixed value.

## Next steps
Measure or find a sourced range of crossing resistances and place the real fabric on the map above; let contacts degrade with flexing together with the yarns (correlated damage); include the aperture bound and compare with a published swatch measurement; more draws with confidence intervals.

## Owner steps
Measuring the resistance of a single crossing with a four-wire meter on a swatch, and shielding effectiveness of the swatch (a shielded-box or coaxial test), would ground this. No bill of materials or prices are given: I have no dated, sourced price list.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest. The stainless conductivity and the shielding formula come from outside the model.

## References
- `research/garment-optics` in this repository (shielding formula, material constants and breakage model; its README lists its own sources).
