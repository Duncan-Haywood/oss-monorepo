# 1099-K Threshold Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/1099-k-threshold-checker/>

A free browser checker for gig and marketplace sellers that estimates
whether a platform (eBay, Etsy, Poshmark, Venmo, PayPal, Cash App, StockX,
and others) is likely to issue a Form 1099-K, per platform and per tax
year.

Open `index.html` in a browser. The calculation is local and works without
an account, network request, or API key. It is arithmetic against the
threshold history below, not a lookup of what any specific platform
actually did or will do -- enter what a platform paid you and verify the
result against your own 1099-K if one arrives.

After using this, you can now see which of your platforms are likely to
send a 1099-K and which are not, per platform and per year, which used to
mean re-deriving four years of federal threshold changes by hand.

## Why this exists

The federal Form 1099-K threshold has changed four times since 2022:

- **2011-2023:** $20,000, more than 200 transactions (both required)
- **2024:** $5,000, no transaction-count minimum (real transition relief,
  Notice 2023-74 -- platforms actually issued forms under this figure)
- **2025 on:** $20,000, more than 200 transactions again (the One Big
  Beautiful Bill Act repealed the phase-down to $600 before it took
  effect; confirmed retroactive to 2022 by IRS Fact Sheet 2025-08)

Four states -- Maryland, Massachusetts, Vermont, and Virginia -- set their
own stricter $600 threshold, independent of the federal figure.

Existing "1099 tax calculator" tools answer "how much will I owe," a
different question from "will a form arrive at all." This tool answers the
narrower, currently-unserved question.

## What this does not cover

- It does not know what any specific platform actually did or will do. A
  platform can issue a 1099-K below the threshold (for internal reasons or
  backup withholding) or make a filing error. This is an estimate of the
  legal threshold, not a guarantee.
- It has verified only four states' own stricter statutes. A state not
  listed is assumed to follow the federal threshold, which is the common
  case but has not been independently confirmed for all fifty.
- It does not determine whether the underlying income is taxable. Business
  income is reportable whether or not a 1099-K documents it -- this tool
  answers the paperwork question only.
- It is not the IRS TIN Matching program and does not file anything.

See the sibling
[`1099k-reconciliation-worksheet`](../1099k-reconciliation-worksheet/) for
reconciling a 1099-K you already have down to net taxable profit.

## No warranty

This tool is free and as-is. It is not legal, financial, or tax advice and
does not replace a qualified tax preparer. You are responsible for
reviewing and verifying its output before relying on it. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.
