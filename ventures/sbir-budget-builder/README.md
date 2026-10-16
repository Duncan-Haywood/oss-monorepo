# SBIR / STTR Budget Builder

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sbir-budget-builder/>

A free browser tool: **type your people, subawards and rates and get the SF424 R&R-style budget lines, plus checks on
the share of work your company keeps, the STTR research-institution share, the fee ceiling and the solicitation
maximum.** Nothing is uploaded.

After using this, you can **see before you submit whether a university subaward or a high fee breaks the
percentage-of-work rule** and paste a clean budget into the agency form, instead of rebuilding a spreadsheet for each
solicitation and finding the problem in a contracting officer's email.

## Model

- Personnel = annual salary (optionally capped) x % effort x months / 12; fringe is a % of personnel.
- Indirect applies to the chosen base: modified total direct costs (excludes equipment and the part of each subaward over
  $25,000), total direct costs, or salaries only.
- Fee is a % of total costs (default ceiling 7%). Price = costs + fee.
- Share of work is approximated by cost, excluding fee: small business = costs not subawarded; research institution =
  subawards typed as `university`. Defaults: SBIR I 66.67%, SBIR II 50%, STTR 40% / 30%. All are editable.

Not modelled: eligibility, cost allowability, cost sharing, agency-specific templates, how a given topic counts work.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
