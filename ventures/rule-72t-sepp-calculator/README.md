# Rule 72(t) SEPP Calculator

A free browser tool for people who want to draw on an IRA before age 59½ without the 10% additional tax:
**enter age, balance and interest rate and see substantially equal periodic payments under the RMD method and
fixed amortization, the lock-in length, the balance needed for an income target, and the penalty exposure if the
schedule is broken.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/rule-72t-sepp-calculator/

After using this, you can now **see how large an IRA you need to fund early retirement through a 72(t) schedule,
and what stopping it would cost, before you take the first payment**.

## Model

- Lock-in: the later of 5 years and reaching age 59½.
- RMD method: prior year-end balance / IRS Single Life Table factor (Reg. 1.401(a)(9)-9, Table I, 2022) for the age that year.
- Fixed amortization: level payment amortizing the balance over the first-age life expectancy at the chosen rate.
- Penalty exposure if modified: 10% of payments taken to date (interest not modelled).

Not modelled: fixed annuitization, the one-time switch to RMD, income and state tax, the federal mid-term rate
ceiling, monthly payments, joint life tables, employer plans, interest on a broken schedule. Life expectancy factors
were entered by hand from the regulation table; confirm them against the current IRS publication.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
every rule that applies to you.
