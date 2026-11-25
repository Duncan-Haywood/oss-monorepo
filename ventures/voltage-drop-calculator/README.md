# Voltage Drop Calculator

A free browser tool for electricians, solar installers and anyone wiring a van, RV, boat or off-grid system:
**enter the voltage, the load and the one-way run, and see the voltage drop for every conductor size, the smallest
size within your target, the longest run and most current each size allows, and the watts (and yearly cost) the
wire wastes.** DC, single-phase and three-phase; copper or aluminium; AWG/kcmil or mm². Nothing is uploaded.

**Live tool:** https://marisstella.app/voltage-drop-calculator/ ·
**Guide:** [what size wire for 12 volts](what-size-wire-for-12-volts.html)

After using this, you can **pick a wire size from the drop you will accept instead of from a chart that assumed
someone else's run**: in the built-in example (30 A, 12 V DC, 15 ft one way), 10 AWG loses 9.3 % and 4 AWG 2.3 %.

## Model

- Drop = 2 x L x I x Z per length (DC, single-phase) or 1.732 x L x I x Z (three-phase, line to line), L one way.
  Z = R on DC; R x pf + X x sin(acos pf) on AC with an entered reactance X. Parallel sets divide R and X.
- R per metre = rho20 x (1 + alpha x (T - 20)) / area x k. Copper rho20 1.7241e-8 ohm m, alpha 0.00393 (100 % IACS);
  aluminium 2.8264e-8, alpha 0.00403 (61 % IACS); k = 1.02 stranded, 1.00 solid.
- Area: AWG diameter 0.127 mm x 92^((36 - n) / 39) (1/0 = 0, 4/0 = -3); kcmil x 0.5067 mm²; metric at nominal mm².
- Longest run and most current: the length and current at which each size reaches the target.
- Wire loss = 2 (or 3) x I² x R x L; annual loss = loss x hours, costed at the entered price.
- Recommendation = the smallest size within the target and not smaller than the entered ampacity minimum.
- A resistance from the reader's table (per 1000 ft or per km) replaces the computed one for the checked size.

Not modelled: ampacity and its corrections, skin and proximity effect, reactance unless entered, unbalanced and
harmonic loads, motor starting, drop across protective devices and terminals. Computed resistances can be a few
percent below published tables for some sizes (and below the maximum resistance of metric conductors).
**Unverified:** checked by hand arithmetic (in `calc.test.mjs`) and unit tests only.

## Run

Open `index.html` through any static server. Tests: `node --test calc.test.mjs page.test.mjs usage.test.mjs`.
Agents: `node platform/agents/tools.mjs call voltage-drop-calculator analyze --input '{"volts":24,"load":40}'` from the repo root.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not engineering, electrical, legal or code-compliance advice, and it does not replace a
qualified professional. **You are responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

Independent of wire and cable makers, code bodies and standards organisations; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`drop_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free to use and source available (FSL-1.1-MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
