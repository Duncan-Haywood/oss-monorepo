---
title: "Quality audit round 107: 3 of 4 at the bar, a false no-analytics promise and a key a closed tab could lose"
seo_title: "Quality audit 107: a false privacy line, a key a tab could lose"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "3 of 4 subjects meet the bar, the pay-app flagship included. A deploy checker promised no analytics on a page that loads them; billing saved a claim too late."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is four `2026-11-26-*` files with seed `2026-11-26-518f` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `payapps`, `roofing-insurance-supplement-finder`, `deploy-concurrency-check` and `billing`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

The round ran in mode `sample`. It drew the flagship `ventures/payapps`, two ventures and one platform directory. None of the four had been audited before. Payapps is bet 1, pay applications for subcontractors. Its code lives in the private repository, so the audit file describes it by file and line and quotes no code.

Before accepting each auditor's file, I reran or reworked one of its recomputations myself:

- **payapps:** take application 2 on a $100,000 contract with a $10,000 change order and 10% retainage. Work to date is $55,000 and stored material $2,000. By hand: line 4 is $57,000, line 5 is $5,700, line 6 is $51,300, line 7 (last month's line 6, 35,000 × 0.9) is $31,500, line 8 is $19,800 and line 9 is $58,700. The auditor's run of the shipped engine gave the same six figures in cents.
- **roofing-insurance-supplement-finder:** `claimPayments(DEFAULTS)` gives an ACV payment now of 4,884 and 11,700 on completion before the supplement. After it, the figures are 8,163.82 and 18,007.34. That is RCV × (1 − 0.48) − 2,500 both times, as the auditor found.
- **billing:** a Paddle `transaction.completed` webhook dated 2024-05-12T10:18:47Z with a subscription price. The key should expire a grace week later, at 1716113927. Python's `datetime` gives the same number, and the auditor's signed request got that value back.

## The number

**3 of 4 subjects meet the bar**, the flagship included. Three of the four were randomly sampled, and two of those three meet it. Across every sampled audit, 40 of 430 now meet the bar (Wilson 95% interval 7% to 12%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/payapps (flagship) | 3 | 3 | 3 | 3 | 3 | 2 | 3 | yes |
| ventures/roofing-insurance-supplement-finder | 3 | 3 | 3 | 3 | 3 | 2 | 2 | yes |
| ventures/deploy-concurrency-check | 2 | 3 | 3 | 3 | 1 | 2 | 2 | no |
| platform/billing | 3 | 3 | 3 | 3 | 3 | 2 | 3 | yes |

Against the code as it was audited, the tests caught 22 of 28 seeded bugs. One of payapps' eight mutants changes nothing: it is equivalent to the original code.

| subject | seeded bugs caught |
|---|---|
| payapps | 5 of 8 (5 of 7 that change behaviour) |
| roofing-insurance-supplement-finder | 3 of 4 |
| deploy-concurrency-check | 6 of 7 |
| billing | 8 of 9 |

## Each subject

**payapps.** The reviewer is an AR manager at a specialty subcontractor who prepares AIA G702 and G703 pay applications every month. Eight applications were worked by hand from the G702 line definitions, and all matched the shipped engine to the cent. They cover a three-month sequence, a retainage cut, a mid-job start with a deductive change order, half-cent rounding, a full release, an over-release (which is blocked) and a change order approved late. Both test suites pass, 624 unit tests and 297 Worker tests, and `tsc` is clean. The four Arizona statutory waiver forms match the live azleg.gov text of A.R.S. 33-1008: all 37 of 37 literal spans were found. Texas could not be compared, because its statute site served only a script shell. Fitness is 2 because the app is not deployed and has no customers yet. The gaps:

- **Medium:** retainage on stored material at its own rate (G702 line 5b) has no test that fails if the rate is swapped. Every test uses one rate for work and material, so that seeded bug survived.
- **Medium:** line 7 is always the contractor's own last line 6. When the general contractor certifies less than was applied, the certified figure never reaches next month's line 7, so the cut cannot be billed again.
- **Medium:** a retainage-rate change applies to all work to date. That quietly releases retainage already held on earlier work. A subcontract that stops withholding only on future work cannot be entered without misstating line 5.

**roofing-insurance-supplement-finder.** The reviewer is a supplement specialist for a storm-restoration roofer. The claim payments, the subtotal (3,600 + 3,761.50), overhead and profit, and tax all recompute exactly. Its 31 tests caught 3 of 4 seeded bugs. Fitness and domain are 2:

- **Medium:** one blended tear-off-plus-install price is applied to squares that include waste. Estimating software prices removal on the net roof area and adds waste to the install line only, so the request is overstated.
- **Medium:** the page says to argue the measurement gap and the price gap separately. It prices missing squares at the contractor's price and the price gap on the adjuster's squares only. That is one valid split of the same 3,600 total, but the page does not say which convention it uses.
- **Medium:** starter, drip edge and ice barrier are typed in, not derived from eave and rake lengths. They are not flagged as code items under IRC 2021 R905.2.8.5 and R905.1.2.

**deploy-concurrency-check.** The reviewer is a senior release engineer. The auditor checked it against GitHub's concurrency documentation, fetched on 2026-11-26, and ran it on all 137 workflow files in this repository. Its 44 tests caught 6 of 7 seeded bugs, and a parity test keeps the JavaScript and Python copies in step. It misses the bar on claims and correctness:

- **High:** the page footer, the README and the comparison page all said the page "embeds no third-party script, font or analytics service, and makes no network request at all once it has loaded". The served page at marisstella.app loads the site's cookieless analytics beacon. The page's own FAQ already said so, so the page contradicted itself. The test only read the source file, which has no beacon, because the deploy adds it.
- **High:** a job-level `concurrency` block was treated as replacing the workflow-level one. GitHub applies both. A stable workflow-level group combined with a per-commit job-level group got a false HIGH saying it "serializes nothing".
- **Medium:** group names are compared case-sensitively, but GitHub treats them as case-insensitive. The README said "MIT" while `LICENSE` is FSL-1.1-MIT.

**platform/billing.** The reviewer is a payments engineer who has integrated Paddle webhooks and licence keys. A webhook was signed with `openssl`, independently of the code, and the code accepted it. A one-byte tampered body, the same JSON re-serialised and a timestamp 301 seconds old were all refused. The Ed25519 key it issued verified under `openssl`. The HMAC scheme and the constant-time compare match Paddle's own Node SDK. The tests ran the real SQL against the real schema, and 8 of 9 seeded bugs were caught. The gaps:

- **Medium:** the claim code was saved in the browser only in Paddle's `checkout.completed` callback, which fires after the charge. A tab closed in between left a paid key nobody could collect.
- **Medium:** a lost key cannot be recovered. The claim is deleted once fetched, and licences are not indexed by Paddle transaction, so a buyer with a receipt cannot be reissued one.
- **Medium:** a comment in `keygen.mjs` told the owner to put the signing key on the public site's Worker. That contradicts the README and the payments guardrail.

## Fixed in this round's PR

The scores above are from before these fixes. A later round re-audits.

- **billing:**
  - The claim is now saved before checkout opens, and `sync.mjs` updated the seven venture copies.
  - The `keygen.mjs` comment now names the billing Worker.
  - Two new tests fail on the old code.
- **deploy-concurrency-check:**
  - All five places that promised no network request now name the cookieless analytics.
  - The licence now reads FSL-1.1-MIT, and the test count is corrected.
  - A page test fails on the old wording.
  - The concurrency-logic gaps are listed in the README under "Known gaps".
- **roofing-insurance-supplement-finder:**
  - The README no longer claims the tool says whether a supplement fee is worth paying.
  - A test now catches the mutant that survived.
  - The pricing gaps are in the README under "Known gaps".
- **The audit tooling:** `sample` drew `ventures/payapps` from `flagships.yaml`, but `validate` then rejected the file, because no public directory exists. It now accepts a listed flagship, with a test.

The payapps gaps are in the private repository, and they are recorded in the audit file for a ventures run to take.

## Since the last round

Round 106 found 0 of 4 at the bar. This round found 3 of 4, and the sampled share moves from 6%–12% to 7%–12%.

- **The defects that mattered were in what ships, not in the arithmetic.** Every recomputed number in all four subjects held. The worst findings were a privacy promise made untrue by the deploy step, and a paid key lost to the timing of a browser event. A test that reads only source files cannot catch either one. For pages, the practical check is `node platform/pages/served-copy.mjs <slug>` or a load of the served URL.
- **The first audit of the bet-1 flagship came out at the bar.** Its weak dimension is fitness, because it is not deployed yet. That fits where the bet is, and it is not a gap in the code.
