# Call recording consent check

Scored 2026-09-17. Composite 5.875 · floor 1 (ai_leverage). The floor is the
point, same as this portfolio's other deterministic checker ventures:
whether a US state defaults to one-party or all-party call-recording
consent is a fixed classification, not something a model decides — no
inference in the loop, which is what keeps per-user cost at zero and every
citation traceable to an exact statute.

## The niche and the evidence for it

Any sales, support, recruiting, or telehealth team that calls people in
more than one state runs into this: fourteen states plus DC require every
party's consent to record a call, the other thirty-six follow the federal
one-party baseline, and two of the fourteen (Nevada, Michigan) carry a real,
commonly-missed gap between what their statute text says and how it is
actually enforced. This is a well-documented, heavily-published compliance
topic — "call recording laws by state," "is [state] one-party or two-party
consent" are established search phrases with abundant existing free content
(state bar consumer pages, the Reporters Committee for Freedom of the
Press's long-running public guide, call-center-compliance vendor blogs).

What that existing content mostly answers is the *single-state* question.
What it does not reliably answer is the case an actual distributed team
has: a caller in one state and a recipient in another, which needs a
combining rule and a citation to check, not two separate lookups — and then
the practical next step, a script to actually read on the call, which no
reference page hands you.

## Why this venture, not a 53rd generic checker or a 300th calculator

`portfolio/pipeline/README.md`'s "archetype itself" section flags both the
`<trade>-bid-calculator` shape (141+ tries, zero confirmed visitors) and the
generic `-check`/`-checker` shape (52+ tries at last count) as needing a
genuinely new angle, not just a new niche, to count as evidence of novelty.
This checks an object no existing venture reads at all — US state
call-recording consent statutes — rather than a new instance of an existing
misconfiguration class. The 52 existing `*-check` ventures cover GitHub
Actions workflow hardening, web/SEO header and metadata hygiene, and file-
format spec compliance; none reasons about a wiretap/eavesdropping statute
or which of two US states' law governs a specific call.

`duplicate_check.py` against a description naming this mechanism (US state
call-recording consent, one-party vs. all-party, interstate combining rule,
disclosure script) topped out at **0.11** against `affiliate-disclosure-
checker` (shares only generic "disclosure" vocabulary — FTC/Amazon
affiliate-link disclosure, an unrelated regime) — well under the 0.45
read-this-first bar. A hand grep of every `VENTURE.yaml` and
`screened-out.md` for "call recording," "wiretap," "two-party consent," and
"one-party consent" turned up nothing except `consent-change-record`, which
is a website cookie/tracking-consent diff tool — a completely different
consent problem this page links to and explicitly distinguishes rather than
leaving a reader to wonder whether they're the same thing.

## Liability: the dimension this write-up spent the most care on

Getting a wiretap-consent classification wrong has a more serious worst
case than most of this portfolio's checkers: several all-party states
authorize per-violation statutory damages (e.g. Cal. Penal Code § 637.2,
$5,000/violation), and some states' eavesdropping statutes carry criminal
exposure. That is real, and scoring this candidate honestly means not
rounding it down to "just another lookup table."

The mitigation is disclosure, not confidence, matching this pipeline's
standing positioning rule (evidence and reference, never a determination
made on the user's behalf):

- Every page states plainly this is not legal advice and not a
  determination for a specific call — in the footer, the FAQ, and the CLI's
  own `--help` and rendered output.
- The two states with a real, disclosed gap between statute text and
  applied law (Nevada, Michigan) are named as ambiguous in the data itself
  (`engine.mjs`'s `note` field), not smoothed into a confident flat answer.
- The interstate combining rule is framed as "the commonly recommended
  conservative reading, backed by one cited precedent" (*Kearney v. Salomon
  Smith Barney*, 39 Cal. 4th 95 (2006)) rather than asserted as a universal
  rule — because no such uniform rule exists across every state pair.
- Pinpoint statute citations are given only for the 14 all-party states
  this build is confident in; the other 36 cite the federal baseline and
  the classification only, rather than inventing a section number that
  might be wrong. A wrong classification is a real risk this table takes
  care to minimize; a wrong-but-confident-looking pinpoint citation for a
  state nobody checked would be worse, because it invites less verification
  rather than more.
- Explicitly out of scope, named rather than silently dropped: in-person
  conversations, 911/emergency calls, law-enforcement recording, a parent's
  vicarious consent for a minor's calls, and any industry-specific notice
  rule layered on top of the wiretap statute.

`liability_containment` is scored **5** — on the gate, not comfortably
above it, matching this pipeline's honest treatment of `eaa-remediation-
pipeline` at the same floor for the same reason (a real, non-trivial worst
case, contained by disclosure rather than eliminated by the product shape).
This is lower than most of this portfolio's checkers (6-9), which is the
correct reflection of a more serious subject matter, not an oversight.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure fixed-table lookup and string templating; no model in the loop |
| Autonomous ops | 10 | Zero-dependency CLI + static browser page, no queue, no server, no ops |
| Time to revenue | 5 | Donations only; "time to first user" is plausible via the established search phrases, but no external search-volume tool was queried to confirm magnitude |
| Gross margin | 10 | Zero marginal cost; both the browser page and the CLI look everything up from a table shipped with the code, no network call ever |
| Defensibility | 2 | A state-consent classification table and a combining rule are both easy to reproduce once someone thinks to; the specific value-add (interstate combining rule with a named precedent, the two disclosed ambiguities, the script generator) is real but modest as a moat |
| Distribution | 6 | Named channel: an established, heavily-published search topic ("call recording laws by state") with a real underserved gap (the interstate case, plus the disclosure-script step) rather than a channel invented from nothing — scored the same as this pipeline's other checkers with a named-but-unmeasured search channel, not higher, since no search-volume figure was queried |
| Liability containment | 5 | On the gate, not above it — see the dedicated section above. A wrong classification's worst case (statutory damages, rare criminal exposure) is more serious than most of this portfolio's checkers; contained by disclosure, named ambiguity, and citation discipline rather than by the product shape alone |
| Ethical robustness | 8 | Donations-only with no per-use fee, so there is no direction in which the tool profits from over- or under-reporting the consent requirement; a business misusing it to justify recording without consent would be misusing a tool that already tells them, in writing, to verify before relying on it. One point held back (rather than 9, matching `cron-dst-drift-check`) because the subject matter's real-world stakes make "measure real engagement before adding scope" a firmer requirement here than for a scheduling tool |

Composite 5.875 (mean of eight). Both gates clear the floor of 5:
`liability_containment` (5, on the gate) and `ethical_robustness` (8). The
dimensions at or below 4 are `ai_leverage` (1) and `defensibility` (2),
named as mitigation targets below rather than disqualifiers, matching this
pipeline's standing treatment of any other narrow, evidence-shaped checker
with the same floor.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility`
2):** keep the classification purely a disclosed fixed-table lookup — never
phrase a result as a determination for the user's specific call; name the
two states with a real disclosed ambiguity (Nevada, Michigan) rather than
smoothing them into a flat answer; cite a specific statute only for the 14
all-party states this build is confident in; frame the interstate combining
rule as the commonly recommended conservative reading backed by one cited
precedent rather than a universal rule; measure real user engagement before
adding any state-specific exception this v0 deliberately does not model.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `consent-change-record` (website cookie/tracking
consent, a different consent regime entirely); not any of the 52 `*-check`
ventures (GitHub Actions hardening, web/SEO/format checks — none reads a
wiretap statute); and not any `<trade>-bid-calculator` (this is a legal
reference lookup and script generator, not a pricing tool).
`duplicate_check.py` returned no match above the read-this-first threshold
against the final description.

## Verdict

**Build now.** Graduated 2026-09-17 as `ventures/call-recording-consent-
check` — a zero-dependency Node CLI (`cli.mjs`, with `check`/`states`/
`script` subcommands), a browser page (`index.html`, looking everything up
client-side from the same table), and a shared engine (`engine.mjs`: a
51-jurisdiction consent-classification table with per-entry statute
citations and disclosed ambiguity notes, an interstate-assessment function
citing the Kearney precedent, and a disclosure-script generator). 54
`node --test` assertions cover the engine's classification table (including
a test that pins the exact set of 14 all-party jurisdictions by name, not
just by count, so a future edit that silently drops or swaps one is
caught), the CLI's argument handling and exit codes for all three
subcommands, and the page's structure, disclaimers, JSON-LD, and worked
example — proven, via a dogfood test, to actually demonstrate a real
all-party requirement when run back through the real engine. Repeat usage,
organic search demand, and the real-world accuracy of any single state's
classification against a from-scratch reading of the current statute text
remain unmeasured, same as every other checker at graduation — with the
added honesty that this one's liability floor is a reason to weigh that
last gap more carefully than usual before expanding scope.
