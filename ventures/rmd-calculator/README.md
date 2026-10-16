# RMD Calculator

A free browser tool for retirees with traditional IRAs and 401(k)s: **enter your December 31
balances and see this year's required minimum distribution, a projection to age 95, what delaying the
first RMD to April 1 costs, how much qualified charitable distributions cut the taxable amount, and the
excise tax on a missed RMD.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/rmd-calculator/

After using this, you can now **know exactly what to withdraw and whether the April 1 delay or a QCD
saves you money**, which used to take a custodian statement and a spreadsheet.

## Model

- RMD = prior December 31 balance / IRS Uniform Lifetime Table distribution period (Pub. 590-B, 2022 table).
- Start age 72 (born 1950 or earlier), 73 (1951-1959), 75 (1960+), SECURE 2.0.
- Delay-to-April-1 puts two RMDs in the second year; extra tax approximated as the first RMD times the
  difference between the two rates the visitor enters.
- QCD counts toward the RMD and is excluded from taxable income, capped at an annual limit the visitor can edit.
- Missed RMD: 25% of the shortfall, 10% if corrected in time.

Not modelled: inherited IRAs, Joint Life table, still-working exception, state tax, IRMAA, tax on Social
Security, legislative change. Unverified against an IRS worksheet or custodian statement.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace the IRS, your custodian or
a qualified professional. Results are illustrative estimates. **You are responsible for reviewing and
verifying its output before relying on it.** To the maximum extent permitted by law, the authors accept
no liability for any loss or damage arising from its use.

Independent of the Internal Revenue Service and any government agency.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`rmd_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do
Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
