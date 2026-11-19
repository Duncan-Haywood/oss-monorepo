---
title: "Quality audit round 74: 0 of 6 at the bar, and 19 of 33 seeded bugs went unnoticed"
seo_title: "Quality audit 74: IFC checker, shard balancer, SBA loans, fuzzer"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "0 of 6 subjects meet the bar. The IFC checker scores 334 of 334 on buildingSMART's test pairs but tests miss unit conversion; a shard tool ran files twice."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the six `2026-11-19-*` files with seed `2026-11-19-e2e7` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-19-e2e7`. It drew the flagship `ventures/ids-model-check`, two ventures, two research projects and one platform directory. None had been audited before. Before accepting the audits I reran two of the auditors' checks myself. The straggler-backup Pareto order-statistic means, 1.582 at k=16 and 3.903 at k=28, match `results.txt`. The Sonnet 5.5 cache-read price of $0.10 per million tokens is the figure the Claude API reference gives. Both reproduced.

## The number

**0 of 6 subjects meets the bar** (0 of 5 sampled, plus the flagship). Across every sampled audit, 33 of 311 now meet it (Wilson 95% interval 8% to 14%). All six are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/ids-model-check (flagship) | 4 | 3 | 2 | 3 | 3 | 3 | 3 | no |
| ventures/ci-test-shard-balancer | 2 | 3 | 2 | 3 | 2 | 3 | 3 | no |
| ventures/small-business-acquisition-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/straggler-backup | 3 | 3 | 2 | 2 | 2 | 1 | 2 | no |
| research/swe-cachecost | 2 | 3 | 1 | 2 | 1 | 1 | 2 | no |
| platform/fuzz | 3 | 3 | 1 | 2 | 2 | 3 | 2 | no |

Tests are the gate that binds. Verification is below 3 in all six. Of 33 hand-seeded bugs in core logic, 19 left every test green.

## Each subject

**ids-model-check (flagship).** Correctness is the best this programme has recorded. The auditor scored it against buildingSMART's own IDS test pairs with a runner of its own, and got 334 of 334 right. It matched IfcTester on all 54 specifications over the three IFC 4.3 models in the tree. On a hand-built Celsius case, IfcTester is wrong and this checker is right. Its BCF export validates against the BCF 2.1 schemas. It misses the bar on one gate only: three seeded bugs in unit conversion passed every test. They were an area prefix not squared, the Celsius offset set to zero, and an inch unit that ignored its millimetre base. The code was right; nothing would have noticed if it broke. The 334-pair conformance test also skips in CI, because the fetch script never runs there.

**ci-test-shard-balancer.** The splitting is sound. The auditor ran an exhaustive search over 600 random cases and never found a better split than the tool's. The shard *commands* were wrong, though. With `--group test`, which the tool itself recommends for a big file, Jest and RSpec commands named whole files. A file split over three shards then ran in full on each: 40.5 s of tests against a predicted 10.4 s on the bundled fixture. Pytest `--group class` selected a file's classes twice.

**small-business-acquisition-calculator.** The loan maths reproduce to the cent against an independent month-by-month schedule. It departs from SBA SOP 50 10 8.1 in three places a lender would catch:
- With full standby ticked, the seller note's payments still come out of year-one cash. SBA allows none during the loan term.
- The SBA guaranty fee is not modelled. On the sample loan it is about $25,200.
- The equity check uses 10% of price, not 10% of total project cost.

**straggler-backup.** Every number reproduces byte for byte. As research it falls short:
- The closest prior work, Dutta et al. (AISTATS 2018) on K-sync SGD, is not cited, and it derives the same round-time result.
- The paper's rule for how many workers to drop was wrong whenever 1/α is a whole number.
- The headline 6x gain from tuning the step size with k comes from a one-dimensional test problem and vanishes at a = 0.1.

**swe-cachecost.** The headline was "cache reads are 45% of an agent run's cost". It rests on a Sonnet 5.5 cache-read price of $0.20 per million tokens in `prompts/pricing.json`. The published price is $0.10. At that price, one-hour cache writes are the largest part (about 52%) and reads about 29.5%. An audit on 2026-11-12 flagged the same price. The script also has no date cutoff, so its results can only be reproduced at the commit that produced them.

**platform/fuzz.** The repair fuzzer behind 50 ventures' guard tests finds real bugs. The auditor confirmed one by calling the venture's `repair()` directly. But the fuzzer had no tests of its own, and 6 of 7 seeded bugs in it survived, including switching off its central check. Its random-number generator read the low bit of an LCG, which alternates on every call. As a result, three of the six mutation operations never ran on their own, and 9 of 36 pairs were ever tried. `--n abc` printed `ok`.

## What was fixed in this round's PR

The scores above are from before these fixes; a later round re-audits.

- **ci-test-shard-balancer:** Jest and RSpec treat a finer grouping as file grouping, with a warning. Pytest class grouping names module-level tests by node id. New tests check that no test is selected by two shards, and they fail on the old code.
- **ids-model-check:** a test pins the three unit conversions, using values checked by hand: 120 in = 3.048 m, 12,000,000 mm² = 12 m², 26 °C = 299.15 K. All three surviving bugs now fail it. A false line in `llms.txt` is gone.
- **platform/fuzz:** the generator scales its high bits and now reaches all 36 operation pairs. The CLI rejects a bad `--n` or `--seed`. The fuzzer has its own seven tests and a README. All 50 venture guards still pass.
- **straggler-backup:** the drop rule reads ⌊1/α⌋, and large steps no longer crash `sgd_rounds`. Tests now catch both bugs that survived.
- **small-business-acquisition-calculator:** inputs like `90k` are rejected instead of read as 90. Tests pin the sensitivity table and cash-on-cash.
- **swe-cachecost:** the README discloses the price error and the corrected split.

Not fixed here, and listed in each subject's README:
- the SBA standby, fee and equity rules;
- the missing prior work in both research projects;
- `pricing.json` itself, which needs the owner's approval to change;
- the CI wiring for the IDS conformance pairs and for `platform/fuzz`, which needs the owner's approval to change.

## Since the last round

Round 73 found 0 of 4 at the bar and 15 of 24 seeded bugs unnoticed. This round's 19 of 33 is the same pattern: outputs are mostly right and tests rarely pin them. The flagship is the clearest case. Its correctness is the best this programme has recorded, and it still fails on tests alone.
