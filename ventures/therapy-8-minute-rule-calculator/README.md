# Therapy 8-Minute Rule Calculator

A free browser tool for physical, occupational and speech therapy clinics: **paste each visit's timed CPT minutes and see the billable units** under the Medicare 8-minute rule, which code each unit goes to, what a per-code count would give instead, which visits were a few minutes short of the next unit, and what the difference is worth at your rates.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/therapy-8-minute-rule-calculator/

After using this, you can **check a day's visits against the CMS table in seconds and see where a payer's counting method changes the units**, which used to be a chart taped to a monitor and a spreadsheet.

## Model

Total timed minutes across the visit set the units: under 8 is 0; otherwise `floor((minutes + 7) / 15)` (8-22 = 1, 23-37 = 2, 38-52 = 3 ...). Whole 15-minute blocks go to the code that earned them; leftover units go to the codes with the most minutes left over, listed order breaking ties. The per-code count gives each code `floor(min/15)` plus one when the remainder is 8 or more; it can exceed the CMS count and is shown for comparison. Untimed codes (evaluations, 97010, 97014, G0283 ...) are listed and add no minutes. A visit that is 1-3 minutes under the next threshold is flagged.

Not modelled: modifiers, the KX threshold, the multiple procedure payment reduction, group or concurrent treatment, payer-specific rules, medical necessity and documentation. No patient identifiers belong in the input.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
