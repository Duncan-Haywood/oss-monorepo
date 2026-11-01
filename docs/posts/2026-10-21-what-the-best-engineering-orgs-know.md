---
title: "What the best-run engineering organisations know, and which of it an AI agent fleet can use"
seo_title: "What the best engineering organisations know, for an AI agent fleet"
date: 2026-10-21
description: "Amazon, Google, Netflix, GitLab, Basecamp, Oxide, Toyota, DORA and the US Army, read for one question: what keeps an organisation of agents on course?"
tags: [engineering-management, culture, ai-agents, org-design, software-engineering]
---

# What the best-run engineering organisations know, and which of it an AI agent fleet can use

This repository is run by about sixteen unattended AI coding sessions an
hour. One person, the owner, steers them a few hours a week. The agents
write most of their own rules into shared Markdown files. Its companion post,
[Who wrote this repository's culture?](2026-10-21-who-wrote-this-repos-culture.md),
measures what that has produced. This post looks outward first: what the
organisations with the best-documented engineering cultures do, what problem
each practice solves, how it fails, and whether it transfers to an
organisation whose engineers are language models.

One caveat applies throughout. A company's account of its own culture
describes what it meant to do. Where independent critique exists, it is
cited next to the claim.

## Decisions: how much process a choice deserves

**Amazon: one-way and two-way doors.** Bezos's 2015 shareholder letter
splits decisions into irreversible ones ("one-way doors"), which deserve slow
care, and reversible ones ("two-way doors"), which "should be made quickly by
high judgment individuals or small groups". He argues that growing companies
end up using the heavy process for everything, which leads to "slowness,
unthoughtful risk aversion" and less experimenting. The failure mode is
misjudging which kind of door you face.
([2015 letter](https://s2.q4cdn.com/299287126/files/doc_financials/annual/2015-Letter-to-Shareholders.PDF))

**Amazon: resist proxies.** The 2016 letter has the line every rulebook
should keep in view: "The process becomes the proxy for the result you want.
You stop looking at outcomes and just make sure you're doing the process
right." Also: "do we own the process or does the process own us?" The same
letter suggests deciding most things with "somewhere around 70% of the
information you wish you had."
([2016 letter](https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders))

**US Army: mission command.** Doctrine (ADP 6-0) describes command through
mission orders "to enable disciplined initiative within the commander's
intent". The commander says what is wanted and why. Subordinates choose how,
and adapt when the situation changes. The Army revised the doctrine in 2019
partly because of a "say-do gap": commanders who wrote statements of intent
and then micromanaged anyway.
([army.mil](https://www.army.mil/article/220314/tradoc_cg_emphasizes_the_importance_of_mission_command))

**Netflix: context, not control.** Managers give context instead of
approving decisions, and the company keeps rules few to avoid "the process
creep that typically happens when companies grow". The critique is real.
Reporting on fear inside the company led Reed Hastings to concede in *No
Rules Rules* (2020) that the charge was "not untrue". Minimal rules depend
on people who already share the context.
([Netflix culture](https://jobs.netflix.com/culture),
[INSEAD on the keeper test](https://digital.insead.edu/post/is-the-controversial-netflix-keeper-test-good-management/))

## Writing: the decision record

**Amazon's six-pagers.** "We don't do PowerPoint ... we write narratively
structured six-page memos", read silently at the start of a meeting
([2017 letter](https://www.aboutamazon.com/news/company-news/2017-letter-to-shareholders)).
Slides hide the reasoning and prose exposes it. The cost is writing time.

**Google design docs.** Malte Ubl lists the parts of a good design doc:
context and scope, goals *and non-goals*, the design and its trade-offs,
alternatives considered. He also says when not to write one: when the
problem is not ambiguous, "there is little value in going through the
process of writing a doc".
([Design docs at Google](https://www.industrialempathy.com/posts/design-docs-at-google/))

**Oxide's RFDs.** Every "request for discussion" has an explicit state:
prediscussion, ideation, discussion, published, committed or *abandoned*.
That last state matters. A dead idea is marked dead instead of lingering
with the authority of a live one.
([RFD 1](https://oxide.computer/blog/rfd-1-requests-for-discussion))
Oxide's values page adds that "absolute adherence to a particular value
should never trump prudence" ([principles](https://oxide.computer/principles)).

**GitLab: handbook-first.** GitLab keeps "one single source of truth", its
values are ranked with "Results for Customers" at the top, and it prefers
"the simplest and most boring solution for a problem"
([values](https://handbook.gitlab.com/handbook/values/)). The handbook also
shows the failure mode. The values page alone is more than 230,000
characters, and a handbook can grow faster than anyone reads it.

**Stripe's writing culture** is widely admired, but little of it is
documented by Stripe itself. Its first-party operating principles say "no
fiefdoms, no hoarding information"
([culture](https://stripe.com/jobs/culture)). The famous footnoted emails are
known only from interviews, so treat them as unverified.

## Learning from failure

**Google SRE: blameless postmortems and error budgets.** "Removing blame
from a postmortem gives people the confidence to escalate issues without
fear", and postmortems are triggered by clear conditions (user-visible
downtime, data loss), not by mood
([postmortem culture](https://sre.google/sre-book/postmortem-culture/)). An
error budget, the gap between the reliability target and 100%, turns the
argument over shipping into arithmetic and "removes the politics"
([embracing risk](https://sre.google/sre-book/embracing-risk/)).

**Amazon's Correction of Error** follows the same idea. It is "not a process
for finding whom to blame". When the root cause reads "human error", what is
usually missing is a check
([AWS](https://aws.amazon.com/blogs/mt/why-you-should-develop-a-correction-of-error-coe/)).
The failure mode is action items that are written and never closed.

**Toyota: jidoka and the andon cord.** Anyone may stop the line the moment
something is abnormal, so a defect does not flow downstream and the problem
is examined while it is fresh
([Toyota Production System](https://global.toyota/en/company/vision-and-philosophy/production-system/)).
The usual companion, "5 whys", is a rule of thumb. A single chain of whys
oversimplifies a problem with several causes.

**Westrum's typology,** which the DORA research uses, sorts cultures into
pathological (power-oriented), bureaucratic (rule-oriented) and generative
(performance-oriented). In a generative culture "messengers are trained" and
"failure leads to inquiry"
([DORA](https://dora.dev/capabilities/generative-organizational-culture/)).

## Measurement, and its corruption

**DORA** ties delivery performance to a few metrics: change lead time,
deployment frequency, recovery time, change fail rate and, more recently,
rework rate. DORA's own guide warns that setting them as targets raises "the
likelihood that teams will try to game the metrics". It also warns against
"the idea that only one metric matters" and against "focusing on measurement
at the expense of improvement"
([DORA metrics](https://dora.dev/guides/dora-metrics-four-keys/)).

**Goodhart and Campbell.** Goodhart (1975) observed that a statistical
regularity tends to collapse once it is used for control. Campbell (1979)
said the more a quantitative indicator drives decisions, the more it
distorts the thing it was meant to monitor
([Campbell](https://jmde.journals.publicknowledgeproject.org/index.php/jmde_1/article/view/297)).

**METR's randomised trial** is the AI-era version. In early 2025,
experienced open-source developers took 19% *longer* with AI tools, and
afterwards still believed they had been about 20% faster
([METR, July 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)).
METR's February 2026 update says those numbers are now out of date and the
newer evidence is weak either way
([update](https://metr.org/blog/2026-02-24-uplift-update/)). The lesson that
survives is that people are poor judges of their own productivity. An agent
judging its own usefulness has the same problem.

## Planning: how much work an idea deserves

**Basecamp's *Shape Up*.** It replaces estimates with an *appetite*, "the
amount of time we want to spend on a project". Work runs in six-week cycles
with a two-week cool-down, and senior people choose at a betting table from
a few freshly shaped pitches. A circuit breaker means a project that
overruns is not extended by default. It also argues against keeping a
backlog: "Really important ideas will come back to you"
([Shape Up](https://basecamp.com/shapeup/2.2-chapter-08)). It depends on
senior people who can shape work well.

**Team Topologies.** "Teams can only handle so much complexity before
breaking down." Cognitive load is the constraint to design for, and the
"inverse Conway" move is to shape teams so that the architecture you want
follows ([key concepts](https://teamtopologies.com/key-concepts)). Conway's
1968 observation behind it: organisations "are constrained to produce
designs which are copies of the communication structures of these
organizations"
([Conway](https://www.melconway.com/Home/Committees_Paper.html)).

## Cautionary tales

- **Spotify.** The 2012 "squads and tribes" model was widely copied. A
  former Spotify product manager later wrote that it was "only ever
  aspirational and never fully implemented"
  ([Jeremiah Lee](https://www.jeremiahlee.com/posts/failed-squad-goals/)).
  Copying an organisation's description of itself copies what it wanted to
  be, not what it did.
- **Valve.** The flat, manager-free company in its 2012 handbook was
  described by a former engineer as "pseudo-flat", with "a hidden layer of
  powerful management structure"
  ([Game Developer](https://www.gamedeveloper.com/business/ex-valve-hardware-expert-shares-uncommon-look-inside-the-company)).
  Remove formal structure and informal structure takes its place.
- **Bridgewater.** Believability-weighted decisions are only as honest as
  whoever controls the weights. Rob Copeland's reporting in *The Fund*
  (2023) argues they were not honest, and Dalio disputes it.
- **Shopify's 2025 AI memo** made "reflexive AI usage" an expectation that
  is assessed in performance reviews
  ([Shopify](https://www.shopify.com/careers/candidate-guide/ai-usage)).
  It may be right on substance. Once an expectation enters a review, though,
  it tends to be measured as an input quota.

## What the agent builders say

Anthropic's own engineering posts come to the same conclusions as the
management literature:

- **Start simple:** "finding the simplest solution possible, and only
  increasing complexity when needed"
  ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)).
- **Prompts have an "altitude":** pitch them between "hardcoding complex,
  brittle logic" and "vague, high-level guidance". Context is a limited
  "attention budget" that worsens as it fills
  ([context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
- **Agents have predictable failure modes.** Long-running agents tend to
  "declare the job done" and mark features complete without testing. The
  fix is structure in files: a feature list in which every item starts as
  failing, a progress file, and commits
  ([long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)).
- **Multi-agent systems duplicate work.** Without a clear objective,
  output format and boundaries for each agent, they also spawn too many
  helpers ([multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system)).

Simon Willison, who runs several agents in parallel, names the human
constraint: "the natural bottleneck on all of this is how fast I can review
the results"
([parallel agents](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)).

## What transfers to an organisation of agents

An agent fleet differs from a company in three ways that matter here.

1. **Every sentence is amplified.** One owner sentence is read by thousands
   of runs a week.
2. **Agents carry no memory between runs**, apart from what is in the files.
3. **The one human's attention is the scarcest resource.** Agent hours are
   cheap.

Those three differences decide which practices fit.

**Fits well:**

| Practice | Why it fits agents |
|---|---|
| Commander's intent | An offhand remark becomes a quota when read as an order. Read as intent (what and why), it leaves room for judgment. |
| One-way / two-way doors | It is the right split between agent autonomy and owner decisions. Agents act on two-way doors; one-way doors go to the human. |
| "Resist proxies" and DORA's warnings | Agents optimise whatever is counted, quickly and at scale. Count outcomes, and never one number alone. |
| Oxide-style rule states | Agents add rules and rarely retire them. A rule with a state and a review date can be marked abandoned. |
| Andon cord, blameless postmortem | Any run should be able to flag a false claim. The fix is a check, not another paragraph. |
| *Shape Up* appetite and circuit breaker | Meta-work (studies of the process itself) needs a fixed budget that ends by default. |
| Cognitive load / context budget | Every always-read line costs every run. Budget the total, not each file. |

**Fits badly:** practices that need a lot of human ritual time, such as
readability certification, week-long memos and believability ratings. Also
anything copied from a company's self-description without checking what it
actually does (Spotify). That includes this repository's own descriptions
of itself.

The companion post applies this list to the repository's own record, with
numbers: [Who wrote this repository's culture?](2026-10-21-who-wrote-this-repos-culture.md).
The brief agents act on is
[`docs/reports/2026-10-21-engineering-culture-for-agents.md`](/docs/reports/2026-10-21-engineering-culture-for-agents.md).

*This post summarises public sources for discussion. It is not management,
legal or professional advice.*
