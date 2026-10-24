# How much clearance does a printed two-pin cover need to assemble, and how wasteful is worst-case stacking? Monte Carlo and closed form (stylised)

A follow-up in the `robofab` track to `research/robofab-insert` (which varied the clearance of one peg-in-hole from 0.2 to 0.6 mm without asking where the number comes from). A printed base carries two pins and a printed cover has two holes. Every pin and hole centre has a random position error and every diameter a random size error, and the cover may translate (not rotate) to find the pins. How much nominal clearance gives 99% or 99.9% assembly yield, and how far off is the textbook worst-case stack? All numbers come from `experiments/results.txt`. Pure Python, no dependencies, simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-tolstack/

- **With exact sizes the yield has a closed form, and simulation matches it.** The pin-to-hole offsets of the two pairs differ by a vector with per-axis sd `2 sp`, so its length is Rayleigh and yield `= 1 − exp(−c² / (8 sp²))` for nominal diametral clearance `c`. At `sp = 0.10 mm` that gives 0.394 at `c = 0.2 mm` (Monte Carlo 0.393) and 0.956 at 0.5 mm (0.956); a test checks it.
- **Position error, not size error, sets the clearance.** At `sp = 0.10 mm`, adding a 0.05 mm diameter sd moves the 99% requirement from 0.607 mm (closed form) to 0.622 mm, and 0.10 mm of size sd to 0.671 mm. Raising `sp` from 0.05 to 0.20 mm raises it from 0.34 to 1.22 mm.
- **The ±3σ worst-case stack asks for 3.0 to 3.4 times the 99% requirement** (2.5 to 2.8 times the 99.9% one) across the six unbiased cases: for `sp = 0.10`, `sd = 0.05` it prescribes 2.0 mm where 99% needs 0.62 mm and 99.9% needs 0.77 mm. Its yield is 1.0000 in every case, so the rule is safe and expensive: a loose fit costs play, which the insertion and gripping projects here treat as a defect.
- **A 3σ root-sum-square rule is close to a 99.9% design** where the holes are unbiased (simulated yield 0.9990 to 0.9998 at 0.45 to 1.72 mm).
- **A hole bias adds to the needed clearance one for one.** With holes printing 0.15 mm small, every requirement rises by 0.149 to 0.150 mm (for example 0.336 to 0.485 mm). The RSS rule fails to cover it unless the bias is added: its yield falls to 0.970 to 0.976 at the smallest spreads.

```bash
cd research/robofab-tolstack
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, about 5 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 45 s; also writes results.json
python3 experiments/figure.py                             # writes experiments/yield_curve.svg
```
Produced with Python 3.11, standard library only. Monte Carlo uses 20,000 assemblies per evaluation with common random numbers, so a yield has a binomial standard error of up to 0.004 near 50% and about 0.0002 near 99.9%; the bisected clearances are therefore good to a few hundredths of a millimetre.

## Motivation

A printed assembly either goes together or does not, and the designer picks clearance before seeing any part. Worst-case stacking is the default rule; if it over-asks by 3 times, the parts are floppy for nothing. The self-replicating shop (track `selfrep`) and the workcell (`robofab-cell`) need to know what fit a printer's spread can actually deliver.

## Builds on

The workcell-twin and sim-to-real manipulation directions of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the assembly-planning interests of CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-insert` and `research/robofab-sequence`. No paper from either group is reproduced, and nothing here is affiliated with or endorsed by them. Tolerance stack-up by worst-case and root-sum-square rules is standard mechanical-design practice; I wrote both rules from their definitions and cite no specific text, since none was checked for this run.

## Method

Translation-only assembly: with `delta_i` the hole-minus-pin offset of pair `i` and `r_i = (D_i − d_i)/2` its radial clearance, a cover translation exists iff the two disks of radius `r_i` about `delta_i` intersect, i.e. `|delta_1 − delta_2| ≤ r_1 + r_2` and both `r_i ≥ 0` (`model.fits`, tested on boundary cases). Each of the four centres gets an independent 2-D Gaussian error with sd `sp` per axis; each of the four diameters an independent Gaussian with sd `sd`; the hole diameters add `c` and a bias. Worst-case rule: `c = 4√2·k·sp + 2k·sd`, the sum of the extreme centre errors and diameter errors (`k = 3`; a test confirms it always fits inside its bounds). RSS rule: `c = k·√(8 sp² + sd²)`. Process spreads (`sp` 0.05 to 0.20 mm, `sd` 0.05 to 0.10 mm, bias 0 and −0.15 mm) are assumed, not measured on any printer.

## Results

`experiments/results.txt` has, for each of 12 cases, the Monte Carlo clearance for 99% and 99.9% yield, the simulated yield at the worst-case and RSS clearances, and the two rule values, followed by a yield curve (`experiments/yield_curve.svg`).

## Limitations

- Stylised. Spreads are assumed; real printed holes are not Gaussian, not independent (one print bed shares a scale error) and not round.
- Two pins only, no rotation of the cover, no tilt, no chamfers, no bore depth. Rotation would let the cover fit more often, so the clearances here are somewhat conservative; more pins would need more.
- Position errors are taken as isotropic and independent; a shared scale error on one plate would shift both holes together and change the result.
- The rules use `k = 3` as is common; the comparison depends on that choice.
- Simulated results are not claims about physical printers.

## Next steps

Allow cover rotation; correlated plate-scale error; fit the spreads to a measured printed test plate (owner step); couple the clearance to the insertion success of `robofab-insert`.

## Owner steps

None for this note. A physical check would need printing a test plate and measuring hole and pin positions; no bill of materials or prices are given and nothing was bought.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.

## Figure
`python3 experiments/figure.py` plots yield against nominal clearance from the committed `experiments/results.txt` and writes `experiments/yield_curve.svg` (standard library only; no new results; stylised simulation).
