# Cron DST drift check

Scored 2026-09-16. Composite 6.625 · floor 1 (ai_leverage). The floor is the
point, same as this portfolio's other deterministic checker ventures: whether
a cron occurrence's local wall-clock time exists once, not at all, or twice,
and what UTC time a fixed-UTC schedule needs per DST segment, is decided
entirely by `Intl`/`Date` timezone arithmetic against the real IANA database —
no model in the loop, which is what keeps the per-user cost at zero and every
finding traceable to an exact instant.

## The niche and the evidence for it

A cron expression that names a wall-clock time is only unambiguous in a
timezone that never changes its UTC offset. Most timezones people actually
schedule jobs in do change it, twice a year, and nothing about cron syntax
can say so. Two separate, real failure modes follow: a schedule whose named
local time falls in a spring-forward gap (never happens) or fall-back
overlap (happens twice), and a UTC-only scheduler whose fixed schedule
silently drifts against the local time someone actually meant.

Both are long-documented, recurring developer pain points rather than
speculative ones. Stack Overflow carries hundreds of questions on variants
of "cron daylight saving," "cron job didn't run DST," and "GitHub Actions
schedule UTC daylight saving." r/devops and r/sysadmin see the same "why did
my job run an hour off" thread reappear every spring and fall. GitHub
Actions' own documentation for its `schedule:` cron trigger states directly
that it always runs in UTC with no timezone option at all — which is exactly
the failure mode this tool's `drift` subcommand computes a concrete number
for, rather than leaving it as a known-but-unquantified footgun.

## Why this venture, not a 202nd trade calculator or a 40th generic checker

`portfolio/pipeline/README.md`'s "archetype itself" section flags both the
`<trade>-bid-calculator` shape (141+ tries, zero confirmed visitors) and the
generic `-check`/`-checker` shape (38+ tries at last count) as needing a
genuinely new angle, not just a new niche, to count as evidence of novelty.
This checks a new *object* entirely — a cron schedule against the real IANA
DST calendar — not a new instance of an existing misconfiguration check, and
it is as much a **generator** as a checker (the `drift` subcommand produces
the two UTC clock times a fixed schedule actually needs, which
`PRODUCT_PLAYBOOK.md` ranks above a plain pass/fail checker on cost/value
grounds).

`duplicate_check.py` against a description naming this mechanism (cron
expressions, IANA timezones, spring-forward/fall-back, fixed-UTC-cron drift)
topped out at **0.12** against `sitemap-lastmod-freshness-check` (shares only
generic "freshness/date" vocabulary) — well under the 0.45 read-this-first
bar. A hand grep of every `VENTURE.yaml` and `screened-out.md` for "cron" /
"timezone" / "DST" / "daylight saving" / "schedule" turned up nothing: no
existing venture, candidate, or screened-out idea in this portfolio reasons
about cron expressions or timezone offsets at all. The closest ventures by
lexical overlap are the six `actions-*-check` GitHub Actions workflow
hardeners (an unrelated misconfiguration class — permissions, cache/artifact
poisoning, injection) and `sitemap-lastmod-freshness-check` (a `<lastmod>`
date-format checker, not a scheduling tool).

**The angle that is new:** no existing venture or candidate reads a cron
expression or does timezone-offset arithmetic at all, and the specific
computation (resolving a local wall-clock time to zero, one, or two real UTC
instants; and computing the two UTC clock times a fixed schedule needs
across a year's DST segments) is not something general cron-parsing tools
(`crontab.guru`, `node-cron`, `croniter`) surface — they answer "which fields
match," never "does the resulting wall-clock time actually exist."

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure `Intl`/`Date` timezone arithmetic; no model in the loop |
| Autonomous ops | 10 | Zero-dependency CLI + static browser page, no queue, no server, no ops |
| Time to revenue | 5 | Donations only; "time to first user" is plausible via search once a developer hits the failure mode, but no external search-volume tool was queried to confirm magnitude |
| Gross margin | 10 | Zero marginal cost; the browser page computes from the visitor's own input using the Intl timezone database already in their browser, and the CLI has no network call |
| Defensibility | 3 | Cron parsing and timezone-offset arithmetic are both well-trodden general techniques; the specific combination (DST-gap/overlap detection plus fixed-UTC-cron drift computation) is a modest, not a strong, moat |
| Distribution | 6 | Named channel: long-documented, recurring cron+DST developer pain (hundreds of Stack Overflow questions, seasonal r/devops and r/sysadmin threads) plus GitHub Actions' own documented UTC-only `schedule:` cron, which names the exact audience for the `drift` subcommand. Scored one point above `agent-instructions-drift-check`'s internal-only evidence because this channel is externally observable rather than resting on this portfolio's own incident history — still without a queried search-volume figure, so not scored higher |
| Liability containment | 9 | Reads only a cron expression and timezone name the user supplies, computes purely from the public IANA timezone database, never touches a third party, and states explicitly that it does not know what a specific scheduler does with a skipped or ambiguous occurrence. Worst case of being wrong is a missed or over-reported drift line, not a legal or financial exposure |
| Ethical robustness | 9 | Donations-only with no per-use fee, so there is no direction in which the tool profits from over- or under-reporting DST risk; gets strictly more useful the more of a user's own schedules they check; the one named limitation (numeric cron fields only, no scheduler-specific behavior claims) is disclosed explicitly on the docs page rather than hidden |

Composite 6.625 (mean of eight). Both gates clear the floor of 5:
`liability_containment` (9) and `ethical_robustness` (9). The dimensions at
or below 4 are `ai_leverage` (1) and `defensibility` (3), named as mitigation
targets below rather than disqualifiers, matching this pipeline's standing
treatment of any other narrow, evidence-shaped checker with the same floor.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility` 3):**
keep the check purely computational and disclosed — never claim to know what
a specific scheduler does with a skipped or ambiguous occurrence, only
whether a named local time exists once, not at all, or twice; state the
numeric-cron-fields-only limitation explicitly rather than silently
mis-parsing a named month or weekday; measure real GitHub/npm engagement and
any external CI adoption before investing further, given the currently
unproven distribution.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not any of the six `actions-*-check` ventures (GitHub
Actions workflow-hardening misconfigurations, unrelated to scheduling
arithmetic); not `sitemap-lastmod-freshness-check` (a sitemap `<lastmod>`
date-format checker, not a scheduler); and not `agent-instructions-drift-check`
or `security-txt-check` (different file/config pairs entirely, sharing only
this portfolio's deterministic zero-dependency shape). `duplicate_check.py`
returned no match above the read-this-first threshold against the final
description.

## Verdict

**Build now.** Graduated 2026-09-16 as `ventures/cron-dst-drift-check` — a
zero-dependency Node CLI (`cli.mjs`, with `next` and `drift` subcommands), a
browser page (`index.html`, computing entirely from the visitor's own typed
cron expression and timezone name), and a shared engine (`engine.mjs`: cron
field parsing with the standard day-of-month/day-of-week OR rule, local
wall-clock-to-UTC resolution that correctly distinguishes normal from
DST-skipped from DST-ambiguous occurrences, and the fixed-UTC-cron drift
computation). 56 `node --test` assertions cover the engine's parsing and
timezone-resolution logic (including tests that derive the real 2027
America/New_York spring-forward and fall-back transition dates from the
engine itself rather than a hardcoded calendar assumption, so they stay
correct if a future tzdata update ever moves the transition rule), the CLI's
argument handling and exit codes for both subcommands, and the page's
structure, disclaimers, JSON-LD, and two worked examples — each proven, via a
dogfood test, to actually demonstrate real DST risk when run back through the
real engine rather than merely looking plausible. Repeat usage, organic
search demand, and any external CI adoption remain unmeasured, same as every
other checker at graduation.
