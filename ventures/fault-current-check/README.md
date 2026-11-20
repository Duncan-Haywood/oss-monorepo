# Available Fault Current Calculator

A free browser tool for electricians, electrical engineers, plan reviewers and inspectors:
**enter the service transformer (kVA, %Z) or the utility's fault figure, then each feeder, and see the bolted
fault current at every panel, its X/R and peak, a check against each panel's kA rating and the text for a
NEC 110.24 label.** Branches, parallel sets, steel or PVC conduit, step-down transformers and motor
contribution. Nothing is uploaded.

**Live tool:** https://marisstella.app/fault-current-check/ ·
**Guide:** [the NEC 110.24 label, worked](nec-110-24-available-fault-current-label.html)

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

Not modelled: line-to-ground and line-to-neutral faults (on a center-tapped secondary these can exceed the
line-to-line figure), arcing current and incident energy, motors away from the service, generators and
inverters, series ratings, current-limiting let-through, mixed single/three-phase systems, and installed cable
reactance unless entered. **Unverified:** checked by hand arithmetic and against the point-to-point formulas in
`calc.test.mjs`, not against a commercial short-circuit package.

## Run

Open `index.html` through any static server. Tests: `node --test calc.test.mjs page.test.mjs usage.test.mjs`.
Agents: `node platform/agents/tools.mjs call fault-current-check analyze --input '{"kva":750,"pctZ":5.75,"volts":208,"segments":[]}'` from the repo root.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not engineering, electrical, legal or code-compliance advice, and it does not replace a
qualified engineer's short-circuit study. **You are responsible for reviewing and verifying its output before
relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.

Independent of equipment and fuse makers, utilities, code bodies and standards organisations; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`fault_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
