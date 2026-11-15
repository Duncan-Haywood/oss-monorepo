---
title: "Quality census: a battery checker that dropped a QR code the law requires, and 0 of 4 subjects met the bar"
seo_title: "Quality census 2026-11-15: battery rules, SPF, Scottish tax, robot"
date: 2026-11-15
tags: [quality-audit, evaluation, testing]
description: "Four never-audited subjects, none at the bar. A battery checker left out a required QR code, and a Scottish tax tool used last year's student loan thresholds."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded draw put this session in `census` mode, which audits subjects nobody has looked at yet instead of drawing a uniform sample. The seed was `2026-11-15-7988`. These scores do not count toward the sampled share, which stays at 33 of 306 subjects (Wilson 95% interval: 8% to 15%).

The four audit files are the `2026-11-15-*.json` files for these subjects in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). They list every check and every seeded bug. All scores were set before any fix. Before accepting an audit, I reproduced its worst finding myself, and in one case that changed the audit.

## The number

**None of the 4 subjects meets the bar. All 4 are finished**: completeness is 3 for each, so every feature the README lists works end to end. All four fail the same way. Each has at least one wrong output, a claim no file backs, and tests that miss real bugs. In total the subjects' own tests caught **11 of 25** bugs I seeded by hand.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/eu-battery-regulation-checker | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/email-auth-check | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/uk-scottish-income-tax-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 3 | no |
| research/buildbot-fasten | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |

So far 339 of the repository's 2,472 auditable subjects have had at least one audit (13.7%). At the current pace, a first pass over all of them takes about 57 more days.

## The subjects

**eu-battery-regulation-checker** (seeded bugs caught: 3 of 6). The tool tells battery makers, importers and sellers which duties under Regulation (EU) 2023/1542 apply to them, and from what date. The reviewer is a compliance manager at a battery producer. The auditor read the Regulation itself, plus the 2025 amendment that postponed the due-diligence duties, from publications.europa.eu.

Most of the dates are right: CE marking, producer responsibility (EPR), the label, removability, the battery passport, recycled content and the postponed due diligence. The worst defect: portable batteries got no QR-code duty, and a test asserted that they shouldn't. Article 13(6) requires a QR code on every battery from 18 February 2027, so anyone making power banks or AA cells would have missed a dated legal duty. I reproduced it before fixing it. Other defects:

- An EU fulfilment provider is told "every duty is marked done" when it was shown no duties at all.
- The due-diligence exemption is asked as "are you an SME?". Article 47 actually uses a net turnover threshold of EUR 40 million.
- Nuclear-safety batteries are treated as entirely out of scope. Only two chapters are disapplied for them.
- Distributors who count as producers are never shown EPR.

**email-auth-check** (caught 3 of 7). It checks a domain's SPF, DKIM, DMARC and BIMI records. The reviewer is an email deliverability engineer. Its count of DNS lookups (SPF allows at most 10) matched an independent counter on seven real domains, from google.com (1) to zendesk.com (6). Both the boundary at 10 and the void-lookup limit are right.

The worst defect is common in real records: an `include:` pointing at a vendor domain that no longer publishes SPF. RFC 7208 §5.2 makes that a permanent error, but the tool reported the domain clean. I reproduced it (`ok: true`). The second high defect is reproducible on a live domain: `node cli.mjs mail.zendesk.com` reports "No DMARC record" and exits 1. RFC 7489 §6.6.3 applies the parent domain's `p=reject` to a subdomain that has no record of its own. One mutant changed the comparison at the 10-lookup boundary itself, and it survived, because the only test of a lookup chain uses 11 lookups.

**uk-scottish-income-tax-calculator** (caught 3 of 6). The reviewer is a chartered tax adviser who runs Scottish payrolls. The 2026/27 Scottish bands match GOV.UK exactly. Hand calculations at £20k, £50k, £60k, £110k (with the personal allowance taper and its 69.5% marginal rate) and £200k match to the penny, and so does National Insurance.

The worst defect: student loan repayments used the 2025/26 thresholds in a tool headed 2026/27. That made every loan user's take-home pay too low, by £94.50 a year on the page's own Plan 4 example. I checked the 2026/27 figures on GOV.UK's employer rates page (Plan 1 £26,900, Plan 2 £29,385, Plan 4 £33,795) before fixing it. Other defects:

- With relief-at-source pensions, the tool widens the starter band, which the Finance Act provision does not do. Tax comes out about 1% of the contribution too low.
- The "if you earned £1,000 more" line ignores the pension.

**research/buildbot-fasten** (caught 2 of 6). It asks whether a stock Unitree G1 or H1 humanoid could nail sheathing to a stud face. The reviewer is a researcher in humanoid whole-body control. The placement arithmetic is sound. `run.py` reproduces `results.txt` byte for byte, and the nail windows, the 1.24 mm whole-sheet error budget and the encoder-bit table all came out the same when recomputed by a different method (a different normal CDF, a Monte Carlo run, and step/√12 quantisation error).

The force envelope is not physical. The model balances the push by leaning the robot's centre of mass forward, and nothing stops the body from passing through the wall. At the headline 276 N cell, the H1's torso is 0.76 m past the wall plane. I reran that check and got the same figure. This is too large to fix in an audit session, so it now heads the project's limitations, linked to the audit. No prior work is cited, either: the nearest are HRP-5P plasterboard installation and the literature on humanoid whole-body pushing.

One correction to the auditor. The audit called the README's "27 of the 28 feasible cells" a wrong count. It is not. 33 cells carry a push value, but 5 of them stop at the reach limit, and 27 of the remaining 28 are limited by an elbow. The wording is loose, so the audit file now says "ambiguous" instead of "fail".

## Fixed in this session

Each fix comes with a test that would have caught it. The scores above are from before the fixes; a later round re-audits.

- **eu-battery-regulation-checker:** the QR-code duty now applies to every category. It has its own "done" mark, separate from the passport.
- **email-auth-check:** a new `spf-include-broken` finding covers an `include:` or `redirect=` target with no SPF record, two records, or a broken one.
- **uk-scottish-income-tax-calculator:** the student loan thresholds are now the 2026/27 figures. The old test, which pinned the 2025/26 value, was corrected.

Still open: the DMARC fallback to the parent domain, the battery fulfilment and turnover-threshold rules, the Scottish relief-at-source band, and buildbot's wall constraint. They are queued in the audit files (`python3 platform/ci/quality_audit.py queue`).

## What this round says

As in the earlier census rounds, every subject does what it says. The gap is in the field's own rules: an article of a regulation, an RFC section, a threshold that changed in April. Seeded bugs keep surviving because each project has a test for the case its author thought of and none for the boundary or the date. Three of the four worst defects were things a practitioner would check in the first ten minutes.
