# Sales Commission Plan Comparison Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sales-commission-plan-comparison-calculator/>

A free browser tool for salespeople weighing offers: **enter two compensation plans (base salary, target
variable, threshold, accelerator, cap, signing bonus, ramp) and see pay at every quota attainment, the
attainment where the plans cross, and which one pays more at the attainment you expect.** Nothing is uploaded.

After using this, you can now **see which offer pays more at the attainment you will realistically hit, not
just at 100% of quota, before you accept one**.

## Model

- Commission at attainment `a` (1 = 100% of quota): zero below the threshold; otherwise
  `target x (min(a,1) + accelerator x max(0, a-1))`, limited by the cap (a multiple of target variable).
- Steady-state pay = base + commission. First-12-months pay adds the signing bonus and pays target variable
  for the ramp months regardless of attainment.
- Crossovers are found on a 1% grid with linear interpolation; a threshold makes pay jump, so a pair of plans
  can cross more than once.

Not modelled: taxes, benefits, equity, quota size and territory quality, clawbacks, repayable draws, split
credit, renewal versus new-business rates, monthly or quarterly threshold rules.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of employers, recruiters and sales-compensation vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`comparison_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
