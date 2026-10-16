# Social Security Claiming Age Calculator

A free browser tool for people approaching retirement: **enter your benefit at full retirement age
from your Social Security statement, and see what claiming at each age from 62 to 70 pays, the
break-even age for waiting, and, for a couple, the best pair of claim ages once the spousal top-up
and the survivor benefit are counted**, including the case where one spouse dies early and the other
lives long. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/social-security-claiming-age-calculator/

After using this, you can now **see how much of the claiming decision is the survivor's income rather
than a break-even age, and pick a pair of ages instead of two separate ones**, which most single-person
calculators cannot show.

## Model

Everything is monthly, in today's dollars, discounted at a real rate the visitor chooses (default 1%).

- Own benefit: -5/9% per month for the first 36 months before FRA, -5/12% beyond, +2/3% per month
  after FRA up to 70.
- Spousal top-up: half the higher earner's PIA minus the lower earner's own PIA, when positive;
  -25/36% per month for the first 36 months early, -5/12% beyond; starts no earlier than both have
  claimed; ends when the worker dies.
- Survivor: the larger of the survivor's own check and the deceased's actual benefit (floored at
  82.5% of PIA if the deceased claimed early), starting at the later of the death and the survivor's
  survivor full retirement age, at 100%.
- Couples: every pair of whole-year claim ages plus each person's exact FRA is simulated under four
  scenarios (planning ages, both die at 80, both live to 95, higher earner dies at 75 and the other
  lives to 95) and the pair with the highest household present value is reported.

Not modelled: income tax, Medicare premiums and surcharges, the earnings test, children's and
divorced-spouse benefits, government pension offsets, the month of first payment, wage indexing before
62, early survivor claiming, legislative change. Unverified against SSA's own calculator.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace the Social Security
Administration, a financial planner or a qualified professional. Results are illustrative estimates
that depend on the values you enter and on how long you and your spouse live. **You are responsible
for reviewing and verifying its output before relying on it**, and before choosing when to claim.
To the maximum extent permitted by law, the authors accept no liability for any loss or damage
arising from its use.

Independent of the Social Security Administration and any government agency.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`claim_analyzed`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do
Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
