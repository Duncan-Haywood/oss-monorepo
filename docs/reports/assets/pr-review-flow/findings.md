# Post-merge review of 16 sampled PRs (2026-10-24)

Sample: 16 of the 1,429 PRs merged 2026-10-19 to 2026-10-24, drawn with
`random.seed(20261024); random.sample(merged_sorted_by_number, 16)` over the
cache written by `fetch.py`. Four independent reviewer agents took four PRs
each. They read the diff, checked it against current `main` (67be6900), ran
tests and probes, and were told that "no real defect" is a valid answer. The
fixes were written and checked by the session that ran the experiment, in the
same PR as this file. Every new test fails on the old code and passes on the
new.

Wall time per batch of four: 149, 189, 216 and 311 s, so a mean of about 54 s
per PR with batches running in parallel. Tokens per batch: 99k, 100k, 112k and
120k, about 27k per PR.

Tier is `platform/ci/post_merge_review.py`'s risk tier: high = CI, trust
boundary, or money/tax/legal paths; code; docs.

| PR | tier | kind | finding (still on main at audit time) | sev | fixed here |
|---|---|---|---|---|---|
| 9726 | code | shift-roster reduced-cost fixing | none; 40 random cases, 0 score mismatches with fixing on/off | – | – |
| 8832 | code | research, chip blocks | none; numbers match results.txt | – | – |
| 8606 | code | SEO meta descriptions | k8s-resource-limits-check said "storage requests"; the tool checks ephemeral-storage *limits* | low | yes |
| 9129 | high | redteam fix, bank.mjs parseCents | NaN amounts in separate Debit/Credit columns became 0, and the row was dropped with no problem reported | low* | yes |
| 9856 | high | MT940 /KEY/value narratives | ING `//` separators and a closing `/` left stray slashes in payee and remittance | low | yes |
| 8489 | docs | prompts review log | E41/E48 relabelled "eighth" (they are the seventh), E49 "ninth" | low | yes |
| 8869 | code | research, surrogate loop | none | – | – |
| 9597 | code | research, sync slope | README described the reset rule as two rejections; the code resets after one | low | yes (text) |
| 8579 | code | where-to-sell sourcing ceiling | none; 72 cases checked | – | – |
| 9867 | high | 1099-K reportability | CLI defaulted every report to "card processor" (no minimum), PayPal/Etsy/Airbnb/Amazon included | low* | yes |
| 9665 | high | re-import dedupe | test named "ids from before the change" never exercised the old-id fallback | low | yes |
| 8632 | high | CSV to SEPA pain.001 | EndToEndId with leading/trailing/double `/` passed with no warning; the sibling validator warns | low | yes |
| 9194 | code | gable walls | stud straddling the peak cut 3/8 in short (224 in wall, 6:12); peak plate joint not over a stud | low | first yes; second noted only |
| 9568 | high | USAA CSV reader | none | – | – |
| 9860 | code | research, delay margin | headline named one integrator disagreement; results show larger ones at dt = 0.1 s | low | yes (text) |
| 9547 | code | flagships.yaml cap | none | – | – |

\* The reviewer rated these low. We would call silently dropping a bank
transaction (9129), and telling a marketplace seller a 1099-K is certain
(9867), medium for a bookkeeping product. The tallies below use the
reviewers' ratings.

Tallies: **10 of 16 PRs (62%) had at least one real defect** still on `main`;
11 findings in all; **0 high or medium** by the reviewers' own ratings; **0 of
16** would have been blocked by a pre-merge reviewer, by the reviewers' own
verdicts. By tier: high 5 of 6, code 4 of 9, docs 1 of 1.

Not counted, but found by three of the four reviewers on their own: research
READMEs link "Live page" at the retired `/monorepo-projects/` path (about
1,050 links, 404 today). That came from the repo rename, not from these PRs.
An open PR at the time (Duncan-Haywood/oss-monorepo#9962) swaps them.

What the reviewers said they could not check: real bank, processor or 1099-K
files (every fixture is hand-written), external toolchains (Yosys), long
benchmark reruns, and browser-only behaviour.
