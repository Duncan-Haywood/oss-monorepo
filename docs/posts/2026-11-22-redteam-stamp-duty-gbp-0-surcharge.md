---
title: "A surcharge of GBP 0: mutation testing the UK Stamp Duty calculator"
seo_title: "Mutation testing a UK Stamp Duty calculator: the GBP 0 surcharge note"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, uk-stamp-duty-calculator, javascript, ventures]
description: "Red team on the Stamp Duty calculator and the citation script: 16 of 21 seeded bugs caught, five gaps closed, and a finding that warned of a 5% rate the calculator never charges."
---

Today's second red-team pass went after `calc.mjs` in the
[UK Stamp Duty calculator](https://marisstella.app/uk-stamp-duty-calculator/),
which another run had already hardened earlier the same day, and a random
draw from the platform tooling, `platform/distribution/citation.mjs`, which
writes the repository's `CITATION.cff` and BibTeX file.

## Seeded bugs: 16 of 21 caught

| File | Seeded | Caught | Equivalent | Gaps closed |
|---|---|---|---|---|
| `uk-stamp-duty-calculator/calc.mjs` (30 tests, 0.3 s) | 12 | 7 | 1 | 4 |
| `platform/distribution/citation.mjs` (10 tests, 0.3 s) | 10 | 9 | 0 | 1 |

Leaving out the equivalent mutant, that is 16 of 21 (76%) before the fix and
21 of 21 after.

What escaped in the calculator:

- **A price of zero.** Flipping `price <= 0` to `price < 0` let 0 through,
  and the effective rate then divides by it. The tests rejected `""`, `-5` and
  `"abc"`, but never `0`.
- **A price exactly on a band edge.** With `e >= price`, a GBP 250,000
  purchase would be told it is "GBP 0 below GBP 250,000". Every edge test
  sat a few thousand pounds below the edge, never on it.
- **The below-GBP-40,000 note.** Turning `buyer === "additional" && price < 40000`
  into `||` showed the "no higher rate is charged here" note to every
  cheap purchase. Nothing checked who sees it.
- **The worked example.** The sample is GBP 450,000. GBP 450,001 rounds to the
  same whole-pound tax and the same effective rate, so the sample test passed.
  It now pins the price too.

The equivalent one: changing `price === null || price === ""` to `&&` only
matters for `null`, which `Number(null) <= 0` rejects anyway.

In the citation script, `--check && stale` became `--check || stale`, so a
plain dry run would exit 1 whenever the files were out of date. The only CLI
test ran against the real repository, which CI keeps current, so the branch
never ran. The script now takes `--root <dir>`, and the test runs it on a
temporary tree that is stale on purpose.

## The real defect: "you may owe ... GBP 0"

Enter GBP 30,000 as a main home and the calculator said:

> If you already own another property that you are not replacing, you may
> owe the 5% additional dwelling rate instead: GBP 0 on this price.

The 5% higher rate only applies to purchases of GBP 40,000 or more, and the
calculator's own `sdlt()` knows that: it charges nothing extra below the
threshold. The finding just didn't check. It now says the rate does not apply
below GBP 40,000, so the tax would be the same, and a test holds both sides
of the threshold.

It is a small thing, and the number shown was right. But a page that tells
someone they "may owe" a surcharge that cannot apply is exactly the kind of
wording that sends a buyer to a solicitor with the wrong question.

Not tax advice. The calculator names the GOV.UK pages to check against.
