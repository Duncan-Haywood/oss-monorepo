---
title: "Quality audit round 48: none of four sampled subjects meets the bar, and our own cost ledger had a wrong price"
seo_title: "Quality audit 48: Section 1256, EU 30-day price rule, model cost, wake bursts"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. The repository priced Sonnet 5.5 cache reads at twice the published rate, so a study of Opus vs Sonnet cost understated the gap: 8.45x, not 6.31x."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-g`, because rounds 42 to 47 had already used today's earlier seeds. None of the four subjects had been audited before. No flagship or platform subject was drawn: each one had been audited too recently to come up again.

## The number

**0 of 4 sampled subjects meet the bar.** Across all sampled rounds, 29 of 206 now meet it (Wilson 95% interval 10% to 20%). Three of the four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/section-1256-futures-tax-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/eu-price-reduction-claim-checker | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/free-modelcost | 1 | 2 | 1 | 2 | 1 | 1 | 2 | no |
| research/ambient-wakeburst | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Across the four subjects, the tests caught 7 of 25 hand-seeded bugs in core logic:

| subject | seeded bugs caught |
|---|---|
| section-1256-futures-tax-calculator | 3 of 7 |
| eu-price-reduction-claim-checker | 2 of 6 |
| free-modelcost | 1 of 6 |
| ambient-wakeburst | 1 of 6 |

All four fail on verification. That is the same pattern as round 47: the arithmetic the author thought about is tested, and the tolerances, guards and boundaries around it are not.

## Verdicts and worst defects

### free-modelcost

**It fails on every gate, and the cause sits outside the project.** It asks how much more an Opus agent run costs than a Sonnet run on the same kind of work in this repository. It compares the two inside strata of the same date and track. The reviewer named for it is an applied statistician who runs observational cost studies and knows LLM API pricing.

The estimator itself is right. An independent re-implementation, written without importing the project's code, reproduced the tool-call ratio (3.16x against 3.15x) and the human-hour ratio (3.62x).

**The price it was fed was wrong (high).** Every run record in this repository is priced from [`prompts/pricing.json`](../../prompts/pricing.json). That file put Sonnet 5.5 cache reads at $0.20 per million tokens. Anthropic's pricing page lists $0.10. Its footnote says cache hits on Opus 5.5 and Sonnet 5.5 cost 0.05x base input, and Sonnet's input is $2. I read that row in the fetched page myself. I then reran the re-pricing script on runs up to 2026-10-21:

| | at the stored $0.20 | at the published $0.10 | as published |
|---|---|---|---|
| matched cost ratio | 6.53x | **8.45x** (6.37 to 10.64) | 6.31x |
| cost per tool call | 2.05x | 2.70x | 2.00x |
| cost per self-estimated human hour | 1.44x | **1.91x** (1.50 to 2.38) | 1.43x |

At the old price the script lands close to the published table, so the price is the cause. The corrected cost per human hour falls outside the published interval.

The README also said "cache reads cost the same (0.20)" for both models. It quoted `swe-cachecost`'s 86% as the share of cost from cache reads, but that figure is reads plus writes.

Other gaps:
- `run.py` reads the live, growing run log with no date cutoff, so nobody can reproduce `results.txt`. Rerun today, it says 5.0x over 21 strata.
- 5 of 6 seeded bugs survived, including swapping the median for the mean.
- No prior work is cited, such as Kapoor et al., "AI Agents That Matter" (2024), or cost-per-task leaderboards.

### section-1256-futures-tax-calculator

**It fails on correctness, verification and claims.** The reviewer named for it is a CPA who prepares trader returns. The auditor fetched IRC §1256 and §1212(c), Form 6781 (2025) and Rev. Proc. 2025-32.

A lot is right. The box 11 aggregates are exact, the 60/40 split is exact on an odd-cent net, and the top blended rate is 26.8% (30.6% with NIIT). A stacked 2026 single-filer case matches to the dollar. By hand, 0.6 × 15% + 0.4 × 32% = 21.8%, so $1,000 of gain is $218 of tax, which is what the tool gives.

**It sent the loss carryback to the wrong part of the form (medium).** Both the loss note and the FAQ said "Form 6781 Part II", which covers straddles. The election is box D, with the amount on Part I line 6. Neither mentioned the limits:
- only the loss beyond other capital gains and the $3,000 allowance can be carried back;
- it goes to the earliest year first;
- it is capped at each year's net 1256 gain;
- estates and trusts cannot elect it.

**A net loss was shown as negative tax (medium).** A $10,000 loss produced "tax at 60/40 −$2,180". Only $3,000 of net capital loss is deductible this year (IRC 1211(b)).

**A row with commas in its amounts was silently misread (medium).** Unquoted thousands separators turned `Broker A,18,250.00,-1,200.00,3,400.00` into a net of −$233 instead of $22,850, with no error.

Other gaps:
- An emptied rate field printed "NaN%".
- A Unicode minus sign was read as positive.
- The footer was another venture's boilerplate ("Not affiliated with any court, housing agency…").

### eu-price-reduction-claim-checker

**It fails on correctness, verification and claims.** It checks a shop's crossed-out price against Article 6a of the Price Indication Directive. The reviewer named for it is an EU consumer-protection lawyer.

The core rule is right. On six price histories the 30-day prior price matched an independent day-by-day computation, including the February boundary and a leap year. By hand, the shipped sample's window runs from 10 September to 9 October. The price is 69 from 5 September and 89 from 20 September, so the prior price is 69, and 59 is 14.49% off it.

**Its progressive-reduction mode skipped the condition that makes it lawful (high).** Article 6a(5) lets the price before the first reduction stand only while the reduction is uninterrupted and keeps increasing. A history of 100, 80, back to 100, then 60, with "was 100", came back `ok`. The standard 30-day prior is 80.

**It accepted percentages half a point too high (medium).** "14.99% off" on a true 14.49% passed.

**It said the Directive requires fines of at least 4% of turnover (medium).** That floor was written into the Unfair Commercial Practices Directive and its siblings, not into the Price Indication Directive. The page also said the rule covers services; Article 6a covers goods.

One limit on this check: eur-lex did not load through the proxy, so the legal text was cited from the auditor's knowledge, and the audit file says so.

### ambient-wakeburst

**It fails on verification and claims, and is the closest of the four to the bar.** It simulates how bursty false wakes are for an m-frames-in-a-row trigger on AR(1) scores. The reviewer named for it is an applied statistician of point processes.

The numbers are right. The full experiment reran byte-identical in 189 seconds. The auditor checked them three ways:
- the textbook level-crossing rate for the wake rate (50.28 against 50.26);
- the mixed-Poisson variance formula for drift (Fano 3.41 / 14.80 / 65.0 against 3.37 / 14.48 / 61.7, with 65.0 inside the reported interval);
- a separate plain-loop simulator.

**Its one step toward a deployed device pointed the wrong way (medium).** The limitations said that at about 1 wake a day the same drift would give a Fano factor "nearer 1". That holds only if the rate's variability stays fixed, and it does not: a rarer threshold is more sensitive to the noise scale. At the threshold that gives 1 wake a day, the mixed-Poisson formula gives a Fano factor of about 6 at sigma 0.05 and about 146 at sigma 0.10. Drift also multiplies the mean daily count by 2 to 9.5. I reran that calculation myself.

**The drift code behind every headline is barely tested (medium).** Using one drift scale per 40-window group instead of per window doubles the Fano factor, and all nine tests still passed.

## What was fixed in this round

The scores above are from before these fixes. A later round re-audits.

- **eu-price-reduction-claim-checker:**
  - the progressive mode now checks that the reduction was uninterrupted and increasing, and falls back to the standard rule with a high finding when it was not;
  - percentages may round the true one to one decimal, no further;
  - the penalty and scope text now say what Article 6a says.
  - 8 new tests, 33 in all.
- **section-1256-futures-tax-calculator:**
  - the carryback is now box D, with its limits;
  - a loss year shows no tax figures and explains the $3,000 limit instead;
  - rows with more than four fields are refused;
  - an empty rate field falls back to the default, and Unicode and trailing minus signs read as negative;
  - the footer is the venture's own.
  - 7 new tests, 27 in all.
- **free-modelcost:** a dated correction now sits above the table, with the re-priced numbers. The table is kept as published so the correction can be checked. The pricing file itself is under the control plane, so its fix ($0.10, plus the missing Fable and Mythos 5.2 rows, and a test that pins every cache-read multiplier to the pricing page's footnotes) waits for the owner in [PR #15120](https://github.com/Duncan-Haywood/oss-monorepo/pull/15120). Until it lands, every Sonnet 5.5 run cost in `prompts/runs/` overstates the API-equivalent figure by roughly a fifth.
- **ambient-wakeburst:**
  - the "nearer 1" sentence is replaced with the calculation;
  - a test now checks the vectorised AR(1) against a plain loop across chunk boundaries; it catches a seeded carry bug that survived before;
  - the docstring and runtime are corrected.

## What changed since round 47

The share meeting the bar moved from 29 of 202 to 29 of 206. The two rounds failed the same way: correct core arithmetic, with the defects in the rules around it and in the tests that would catch them. The verification gate failed in all eight subjects of rounds 47 and 48.

What is new this round is where the worst defect sat. It was not in the subject's own code but in a shared price table that every run record reads. Auditing one research project found an error in about 1,900 Sonnet 5.5 run records (2,333 priced Opus and Sonnet 5.5 runs, 462 of them Opus). The tool that measures what this repository's runs cost was itself mispriced, and no test compared it with the published page. Now one does, once the owner merges it.
