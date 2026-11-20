# Available Fault Current Calculator

A free browser tool for electricians, electrical engineers, plan reviewers and inspectors:
**enter the service transformer (kVA, %Z) or the utility's fault figure, then each feeder, and see the bolted
fault current at every panel, its X/R and peak, a check against each panel's kA rating and the text for a
NEC 110.24 label, and, where you give the equipment type and clearing time, its IEEE 1584-2018 arc-flash
incident energy and arc flash boundary.** Branches, parallel sets, steel or PVC conduit, step-down transformers and motor
contribution. Nothing is uploaded.

**Live tool:** https://marisstella.app/fault-current-check/ ·
**Guide:** [the NEC 110.24 label, worked](nec-110-24-available-fault-current-label.html) ·
**Arc flash calculator:** [single point, IEEE 1584-2018](arc-flash-calculator.html)

After using this, you can **check every panel's interrupting rating against the current that can actually reach
it, and see where a point-to-point hand calculation understates it**: in the built-in example (1500 kVA, 3.5 %,
480 V, with motors) a lighting panel 150 ft down a 1/0 feeder sees 13,008 A against its 10 kA rating, and adding
the impedances as magnitudes would have said 12,281 A (5.6 % low).

## Model

- Source on the service voltage V: transformer Z = %Z x (1 - allowance) / 100 x V² / VA, split by its X/R;
  utility fault level adds V² / VA (X/R entered; blank MVA = infinite bus); or a known utility figure gives
  |Z| = V / (k I) with an entered X/R. k = 1.732 three-phase, 1 single-phase line to line.
- Motors: a parallel source at the service, at the source's angle, sized to add multiplier x full-load amps there.
- Feeder: (R + jX) x length x m / sets, m = 1 three-phase, 2 single-phase. R per metre = rho20 (1 + alpha (T - 20)) /
  area x 1.02 (stranding) x (1 + ys), ys the IEC 60287-1-1 skin-effect factor (ks = 1) at 50 or 60 Hz. Copper
  1.7241e-8 ohm m, alpha 0.00393; aluminium 2.8264e-8, alpha 0.00403. Area from the AWG series, kcmil or metric.
  X defaults to 0.050 ohm per 1000 ft, x 1.25 in steel conduit, or the reader's figure.
- Step-down transformer: upstream Z x (Vs / Vp)² plus its own Z on Vs (the same allowance applies).
- Fault current I = V / (k |Z|). The magnitude sum repeats the network with |Z| added as plain numbers, which is
  exactly what the point-to-point f and M multipliers do (tested against those formulas).
- Peak = kappa x 1.414 x I, kappa = 1.02 + 0.98 e^(-3 R/X) (IEC 60909). Label figure = I rounded up to 100 A.

## Arc flash

`arcflash.mjs` is the IEEE 1584-2018 model (three-phase, 208 V to 15 kV), ported from the MIT-licensed Python
library [`arcflash`](https://github.com/LiaungYip/arcflash) by Li-aung Yip (coefficient tables, enclosure
correction, Eqs. 1-25; licence notice in the file). That library reports agreement with the IEEE's calculator
spreadsheets on 144,000 cases; this port is tested in `arcflash.test.mjs` against **every intermediate and final
figure of the standard's worked examples, Annex D.1 (4.16 kV VCB) and D.2 (480 V VCB)**: arcing currents at the
three reference voltages, width_1, height_1, EES, CF, intermediate and final energies and boundaries, VarCF and the
reduced-current case. All pass to the printed precision. A random-input comparison with the Python library itself
was not run in this session (running downloaded code was not permitted); that is the next check.

- Per panel in the main tool: choose a typical equipment type (Tables 8 and 10 gaps, sizes and working distances),
  a configuration (or "worst of VCB, VCBB, HCB") and the clearing time at the full and the reduced arcing current.
  The bolted current is the panel's computed fault current, motors included.
- `arc-flash-calculator.html`: one point with the real enclosure dimensions and every intermediate value.
- Both cases run, each with its own time; the higher energy is reported. In Annex D.2 the reduced case (319 ms
  against 61.3 ms) moves the energy from 2.77 to 12.70 cal/cm²: one time for both would understate it by 78 %.
- Inputs outside the model's range are refused. An optional cap applies to both times; times over 2 s are flagged.
- Not modelled: single-phase, DC and above 15 kV; multi-step arcs (motor decay, a second device); the device curve.

## Not modelled

Line-to-ground and line-to-neutral faults (on a center-tapped secondary these can exceed the
line-to-line figure), the protective device's clearing time (you read it at the arcing current shown), motors away from the service, generators and
inverters, series ratings, current-limiting let-through, mixed single/three-phase systems, and installed cable
reactance unless entered. **Unverified:** checked by hand arithmetic and against the point-to-point formulas in
`calc.test.mjs`, arc flash against IEEE 1584-2018 Annex D in `arcflash.test.mjs`; neither against a commercial
study package.

## Run

Open `index.html` through any static server. Tests: `node --test calc.test.mjs page.test.mjs usage.test.mjs arcflash.test.mjs`.
Agents: `node platform/agents/tools.mjs call fault-current-check analyze --input '{"kva":750,"pctZ":5.75,"volts":208,"segments":[]}'` from the repo root.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not engineering, electrical, legal or code-compliance advice, and it does not replace a
qualified engineer's short-circuit or arc flash study. **You are responsible for reviewing and verifying its output before
relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.

Independent of equipment and fuse makers, utilities, code bodies and standards organisations; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`fault_calculated`, `example_loaded`,
`report_downloaded`, `arcflash_calculated`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
