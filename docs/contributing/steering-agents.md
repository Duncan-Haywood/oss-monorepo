# Steering the agents: the owner's process, step by step

**For:** a person who wants to direct work in this repository the way its
owner does, or run the same process on a repository of their own.
**Not for:** sending a single fix by hand; that is
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) and the rest of
[this folder](README.md). The agents' side of the same
process is [`.github/prompts/human-requests.md`](../../.github/prompts/human-requests.md).

The owner writes little code here. The work is done by Claude Code sessions,
about 250 to 300 a day, and the owner spends a few hours a week deciding
what they should be doing and correcting them when they drift
([`prompts/steering.md`](../../prompts/steering.md), "Amplification"). Of the
2,601 runs recorded from 13 to 24 October 2026, 90 started from a sentence
the owner typed; the other 2,511 started from a scheduled prompt. The
numbers and how they were counted are in
[the post on this process](../posts/2026-10-24-how-one-person-steers-an-agent-fleet.md).

The process is a loop with six parts. None needs a special tool beyond
Claude Code and GitHub.

1. Keep a baseline of scheduled sessions running.
2. Ask for things in plain sentences.
3. Let each session land its own work.
4. Read what came back.
5. Turn what you liked or disliked into a direction.
6. Cut the rules that stopped helping.

Plus the part only you can do: money, accounts and anything published under
your name.

## 1. A baseline of scheduled sessions

Most runs start from a scheduled Claude Code session whose prompt is one
line. The owner's prompts over the period read like "continue work on the
repo aiming to develop, deploy, market, sell and support revenue generating
software products"; the line every routine needs is
"Read ./prompt.md and follow it." Schedule it in Claude Code on the web (a
routine), with cron on your own machine, or from a workflow such as
[`.github/workflows/claude-routine-trigger.yml`](../../.github/workflows/claude-routine-trigger.yml).

[`prompt.md`](../../prompt.md) does the rest: `python3 prompts/promptctl.py
route` draws a track by the weights in
[`prompts/routing.json`](../../prompts/routing.json) (on 2026-10-24: ventures
0.34, research 0.34, process 0.10, creative 0.10, red team 0.07, explore
0.05, and a review every 40 merged runs for a share of runs). **Changing
those weights is the cheapest way to change what the fleet does.** The owner
has done it by saying so in a session ("have a red team blue team ... run
regularly", "some percent of work study the process ... maybe 5%"), and an
agent edited the file.

Cost: each scheduled session draws on your Claude plan or API budget. In
this repository the median scheduled run cost about $0.69 at API prices
(`prompts/runcost.py`, measured on about half the records). Start with one
or two an hour and raise it once you trust the output. Adding unattended
automation that spends money is always the owner's decision, never an
agent's.

## 2. Ask in plain sentences

Open a session on the repository (Claude Code on the web, the desktop or
phone app, or the CLI) and type what you want. The owner's 90 direct asks
in the period fell roughly into four kinds (a keyword sort, spot-checked):

| Kind | Share | Real examples, verbatim |
|---|---|---|
| A question, answered as a report and a post | ~40% | "can you analyze where tokens go to in a given run? ... and propose potential ways" · "how much of the research is a verifiable repeatable experiment versus a made up thing do a report and blog post" |
| A new project or direction | ~22% | "I want to make ai accounting systems" · "some projects to add on robo vaccum cleaner robo mopper ... fully designed projects under mit licenses." |
| A change to how runs work | ~19% | "I want most runs to write up an agent doc and blog post according to its judgment on what." · "drop the static-site-only requirement" |
| Feedback on the site or a product | ~9% | "the updates on the ghp site look great. let's keep vamping that up significantly." |

What these have in common, and what tends to work:

- **Short is fine.** Typos and half-sentences are fine. The session reads
  the repository for context; you supply intent.
- **Say what you want back.** "Do a report and blog post", "an agent doc",
  "put it on the todo and work on it", "make a report and add action items".
  Without it a session picks for you; with it you get the shape you will
  read.
- **Give your opinion and how sure you are.** "I have a tentative opinion
  that it would be beneficial to work on projects that are hard enough..."
  lets the agent weigh it, push back, and record it at the right strength.
- **Follow up in the same session.** "How did this go? keep going on it."
  works, including after an interruption: the session checks what landed
  and continues.
- **Ask for the why when something looks wrong.** "Analyze what led to this,
  propose fixes, blog post and agent doc" turned an embarrassing front-page
  tool into a test every tool now has to pass
  ([post](../posts/2026-10-21-a-tool-has-to-beat-asking-a-chatbot.md)).

The session routes itself to the closest track
(`route --track process|ventures|research|...`), records your sentence as
the run's `input`, and lands the work.

## 3. Let each session land its own work

Every session, scheduled or direct, opens a pull request, checks it, merges
it itself and writes a run record
([`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md)).
There is no human review gate. That is deliberate: at 250 runs a day, a
review queue would be the whole job, and fixing forward on `main` costs
less than waiting. Cross-review bots exist
([`platform/ci/agent_review/`](../../platform/ci/agent_review/README.md)) and
assist; they are not a gate.

What you keep is the ability to say "that was wrong" afterwards, which is
part 5.

## 4. Read what came back

At this volume nobody reads every diff. These are the places the results
surface, the readable ones first:

- **The posts and reports.** Most runs now write one
  ([`docs/posts/`](../posts/), [`docs/reports/`](../reports/)); they are the
  readable summary of what was learned, with real numbers.
- **The daily brief** on the site (`dev/daily/`,
  [`platform/daily/`](../../platform/daily/README.md)): about fifteen minutes,
  to read or to listen to.
- **The development dashboard** (`dev/` on the site,
  [`platform/devstats/`](../../platform/devstats/README.md)): merges, CI and
  cost.
- **Run records** in [`prompts/runs/`](../../prompts/runs/):
  `python3 prompts/promptctl.py measure --section 'doc friction'` shows
  what slowed runs down; `deviations` shows where they departed from the
  defaults, and why.
- **What is waiting on you:** `python3 portfolio/ledger/decision_queue.py`.

A good habit from the record: a periodic "24 hour review" or "how did X go?"
session, which reads the above and reports back in one place.

## 5. Turn a remark into a direction

When you say something you want to hold beyond one run, the session writes
it down where later runs will read it, with your words and the date. Lasting
goals go in [`prompts/goals.md`](../../prompts/goals.md), which carries 37
lines citing the owner by date; procedure goes in the layer that fits
([`prompts/SYSTEM.md`](../../prompts/SYSTEM.md)). `goals.md` is the owner's
file: agents propose changes to it and do not make them unasked.

The thing to know before you do this: **every sentence you write is read
thousands of times.** A passing preference here once became a quota (1,236
ventures by 2026-10-15, mostly calculators), and a single incident became a
permanent page of rules ([`prompts/steering.md`](../../prompts/steering.md)).
So:

- **Give a direction of travel and its reason, not a number.** "Depth over
  calculators" (`goals.md`, set 2026-10-20, with its reasons) is how the
  calculator quota was undone.
- **Mark hard limits as hard and everything else as a guideline.** The
  owner's rule since 2026-10-21: outside legal, financial and ethical
  liability, "guidelines and suggestions makes more sense than hard and fast
  rules". Agents follow a guideline unless they have a reason, and record
  the reason as a `deviation`.
- **Prefer asking for a check to asking for care.** If a mistake happens
  twice, ask for a test or a CI check that catches it; a paragraph asking
  agents to be careful is read by every run and changes little.

## 6. Cut what stopped helping

Rules pile up one incident at a time and are almost never removed. The
review track (a share of runs, every 40 merged runs) measures the run
records and rewrites the prompts the friction points at; the process track
(about 10% of runs) fixes the process itself. You can also ask directly:
"cut the deadweight in rules and processes" and "transition repo rules to
guidelines" were both owner requests that shipped.
`python3 prompts/rule_language.py` counts absolute wording per guidance
file, which is a quick way to see where the rules have grown teeth.

## The part only you can do

Some steps need a person: moving money, opening accounts that need a card,
an ID or a domain, publishing under the portfolio's public name, paid
unattended automation, and pasting secrets. Agents prepare these so they
take minutes and queue them in one place
(`python3 portfolio/ledger/decision_queue.py`) rather than asking in every
session.

## If you have write access to this repository

Your sessions are direct requests like the owner's, and agents treat them
the same way, with two exceptions that stay the owner's: changing the goals
and guardrails in `prompts/goals.md`, and the owner-only steps above. To
change either, write a proposal in
[`prompts/experiments.md`](../../prompts/experiments.md), "Proposals for the
owner". Check open pull requests before you ask for something big: about
sixteen sessions start every hour, and one may already be on it.

No session to hand? Dictate the ask into [`ideas/INBOX.md`](../../ideas/INBOX.md)
from github.com on your phone; sessions treat it as a direct request and pick
up the oldest first ([`ideas/README.md`](../../ideas/README.md)).

## Running the same process somewhere else

- **A new business from one sentence:**
  [`platform/business-template/`](../../platform/business-template/README.md)
  generates a repository with its own `prompt.md`, router, function briefs,
  owner checklist and guardrails, ready for scheduled sessions.
- **This repository's prompt system:** [`prompts/README.md`](../../prompts/README.md)
  explains the routing, run records and review loop, and works as a starting
  point to copy. Everything here is MIT licensed.

Start small: one or two scheduled sessions an hour, a handful of direct asks
a day, and a review session every day or two. Raise the rate when the
reviews say the runs are landing useful work.
