# Demand Charge Interval Analyzer

A free browser tool for businesses billed a demand charge: **paste your utility's 15-minute interval data and see what your worst 15 minutes cost each month**, whether a ratchet is carrying an old peak forward, and what holding demand to a lower cap would save and require.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/demand-charge-interval-analyzer/

After using this, you can **tell whether your bill is set by a short spike you can shave or by a sustained load you cannot**, and size a peak-shaving battery or a load-staggering fix against real numbers instead of a vendor's estimate.

## Model

Readings are parsed as wall-clock timestamps plus a usage column (kW, or kWh per interval converted by interval length). Per month: peak = highest interval kW, billed = max(peak, ratchet% x highest peak of the prior 11 months in the data), charge = billed x rate, load factor = average / peak. A cap sweep recomputes billed demand with every interval limited to 97%...70% of the highest peak; saving = (charge before - after), scaled from complete months to 12. Battery energy = the largest contiguous stretch of kWh above the cap, divided by the usable share; cost = energy x $/kWh + kW shaved x $/kW; payback = cost / yearly saving.

Not modelled: time-of-use or seasonal demand tiers, power-factor charges, round-trip losses, degradation, incentives, controls, tariff changes, energy-charge arbitrage.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, engineering or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded; pasted data and chosen files are read in your browser only. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
