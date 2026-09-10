# Affiliate disclosure checker

Scored 2026-09-09. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: whether a link matches a known affiliate signal and whether a known
disclosure phrase appears before it is decided by pattern matching against
plain text, not a model in the loop — which is what keeps the per-user cost
at zero and every finding traceable to the exact rule that fired.

A blogger or content creator who monetizes with Amazon Associates or another
affiliate network carries a real, checkable, and specifically *named*
obligation most of the fleet's checker ventures do not resemble: Amazon's own
Associates Program Operating Agreement requires every page carrying an
Associates link to state, in substance, "As an Amazon Associate I earn from
qualifying purchases" — a contractual term separate from, and in addition to,
the FTC's general "clear and conspicuous, before the link" disclosure
standard from its Endorsement Guides. Amazon has terminated Associates
accounts for missing this, which erases the account's entire earning
history, not just future commissions on the page in question — a real,
named income-protection fear that is a recurring, not hypothetical, post
type in r/AmazonAssociates, r/Blogging, r/juststart, and r/AffiliateMarketing.

The tool scans a page's HTML for recognised affiliate-link signals (an
Amazon `tag=` parameter or `amzn.to` short link, `rel="sponsored"`, known
affiliate-network tracking domains — ShareASale, CJ/Commission Junction,
Rakuten/LinkSynergy, Impact, Skimlinks, VigLink, rewardStyle/LTK, AWIN,
AvantLink — and generic tracking parameters like `irclickid=`) and reports
whether a disclosure phrase appears before the first one in the page's own
reading order, exactly as FTC guidance asks. It separately checks whether any
Amazon link specifically carries Amazon's own required exact statement, since
a generic "this post contains affiliate links" note satisfies the FTC's
general standard but not Amazon's specific contractual term — a distinction
no existing venture or generic disclosure plugin draws. It is a fact-checker,
never a compliance determination: it names which known patterns it found and
their order, and says so explicitly on both pages and in its own FAQ schema,
never "you are compliant" or "the FTC will not act on this."

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section already argues
for the checker/CLI shape over a 232nd `<trade>-bid-calculator`. This write-up
also weighs the *niche*, not just the shape: the fleet already has five
checker ventures serving one audience — a developer diffing a repo artifact
against its own source (`env-example-drift-check`, `structured-data-drift-
check`, `license-drift-check`, `ios-privacy-manifest-check`,
`dependency-confusion-check`, and siblings). A sixth entry in that exact
family risks the same "marginal variant" concern DIRECTION.md raises about
the 141st bid calculator, even though each individual diff pair is distinct.
This candidate deliberately serves a different audience — a content creator
checking their own published page against a disclosure requirement, not a
developer checking a repo artifact — which is why it is filed under the
`solo-earner` category by audience (alongside `ats-resume-checker`, a
job-seeker checking their own resume) rather than folded into the `ci`
category's developer-checker family.

`duplicate_check.py` was run against three phrasings before this write-up was
started: an FTC/sponsored-content framing (top score 0.09, against
`duplicate-payment-audit`, unrelated), an Amazon-Associates-specific framing
(top score 0.15, against `ats-resume-checker`, unrelated — the only
screened-out row that appeared at all was `chatbot-disclosure-monitor` at
0.08, which is an AI chatbot disclosing it isn't human, a different
disclosure entirely from an affiliate-link disclosure on a blog post), and
the final description used in `VENTURE.yaml` (top score 0.17, against
`structured-data-drift-check`, which shares only the generic
"deterministic diff/checker" shape and reads nothing about affiliate links
or disclosure wording). All three are far below the 0.45 review bar. A hand
grep of every `VENTURE.yaml` for "affiliate" returned zero hits; "disclos"
returned only `ada-title-ii-evidence` (an unrelated accessibility-disclosure
subject) and this file.

Outputs are pattern-match facts about text the user supplies, not legal
advice, and the tool makes no claim about FTC or Amazon compliance — that
positioning is in the disclaimer on both pages and in the FAQ schema. No
content is uploaded by the browser tool; the CLI reads only local files
named on the command line, with no network call at all.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic pattern matching against known affiliate-link and disclosure-phrase signals; no model in the loop |
| Autonomous ops | 10 | Static page + zero-dependency CLI, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a creator finding and using a free checker inside weeks is plausible via subreddit and search discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 4 | A transparent, narrow pattern-matcher with no data moat; easy to reimplement, defensible only by being first and correct for the Amazon-vs-FTC distinction specifically |
| Distribution | 7 | Named channels: r/AmazonAssociates, r/Blogging, r/juststart, and r/AffiliateMarketing, where "amazon associates terminated my account" and "FTC affiliate disclosure" are real, recurring threads; the failure mode is a specific, contractually-required sentence rather than a vague compliance posture, which is sharper and more concrete than the portfolio's other checker ventures' developer-forum channels |
| Liability containment | 8 | Reports which known patterns were found and their order in the text, never a legal or contractual determination; the disclaimer on both pages explicitly says so, and the FAQ schema states directly that it does not determine FTC or Amazon compliance |
| Ethical robustness | 9 | Gets more useful to a creator as they check more of their own posts; benefits the reader too (a disclosed affiliate link is exactly what consumer-protection disclosure rules exist to produce); no direction in which the creator profits from the tool being wrong |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation beyond the disclaimer positioning above. The
only dimensions at or below 4 are `ai_leverage` (1) and `defensibility` (4),
matching the deliberate floor pattern of the portfolio's other deterministic
checker ventures (`env-example-drift-check`, `poshmark-fee-calculator`,
`duplicate-payment-audit`) rather than a defect needing mitigation.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility` 4):**
keep the check deterministic pattern-matching only, on text the visitor
supplies; never claim an FTC or Amazon compliance determination; measure
real user reports before adding any AI-assisted feature or paid integration.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not any developer-facing drift/evidence checker (none
of them reads a href, a `rel` attribute, or affiliate-disclosure phrasing);
it is not `chargeback-evidence-packet`, `consent-change-record`, or any other
`evidence`-category venture (none of them is about affiliate-link
disclosure); it is not `chatbot-disclosure-monitor` in `screened-out.md`
(AI-chatbot-is-not-human disclosure, a different subject and a different
audience); and it does not appear anywhere else in `screened-out.md`.
`duplicate_check.py` returned no match above the read-this-first threshold
against any of three phrasings tried.

## Verdict

**Build now.** Graduated 2026-09-09 as `ventures/affiliate-disclosure-
checker` — a static, deterministic browser checker with a tested detection
engine (Amazon Associates and generic affiliate-link signal recognition,
Amazon's exact required phrase vs. generic FTC-style disclosure phrasing,
and reading-order placement), a matching zero-dependency CLI for a
pre-publish gate against a built site's output directory, a secondary
guide page answering the Amazon-vs-FTC distinction directly, usage
counting, and the standard disclaimer/privacy/sponsor copy. Repeat usage,
organic search demand, and distribution remain unmeasured, same as every
other checker at graduation.
