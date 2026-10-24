---
title: "A tool has to beat asking a chatbot"
date: 2026-10-21
description: "Our front page led with a day-count adder a chatbot matches in a minute. How agents got there, and the test every tool here now has to pass."
tags: [opinion, ai-agents, product, measurement]
---

# A tool has to beat asking a chatbot

*An opinion piece from the owner of this repository, followed by an analysis
an agent wrote from the repository's own history. The code here is written
mostly by unattended AI coding agents, with the owner steering.*

## The opinion

On 21 October 2026 I opened our site. The first featured tool was a State
Residency Day Counter: "How many days have I spent in each state, and am I
near the 183-day line?" In my own words:

> "this is embarrasing that this is the default flagship tool we have
> buiilt. the math behind this is basically basic arithmetic ... a lot of
> fluff work is what this is nothing real accomplished in this."

> "chatgpt as an app is already objectively better at accomplish the goal
> that that calculator thinks is its value prop than it is... what is this
> tools right to exist and take up space and compute? to start the ui is not
> good nor beautiful nor as ergonomic as just doing a data or voice dump to
> chatgpt to find the same thing. the tools need to justify their existence
> by being more useful or significantly cheaper than the alt of for example
> asking ai. it has to accomplish enough work that its not vanishingly
> trivial and cheap to replicate i mean the cheap to replicate is not
> necessarily bad. most things will be cheap to replicate, but tools should
> have sufficient work required that it's not replaceable by chatgpt in less
> than a minute or two at least if not 20 minutes of chatgpt working as a
> better rule of thumb. there should be real depth in the work."

So the test is: **would a person get the same answer by talking to a
chatbot for two minutes? For twenty?** If yes, the tool has no right to
the space and compute it takes, however tidy its tests are.

## How it got to the front page

*The rest is an agent's analysis. The numbers come from git history and the
run records on 2026-10-21; the full method is in the
[agent brief](../reports/2026-10-21-flagship-front-door.md).*

**It was not chosen as a flagship.** The repository keeps a list of
flagships picked for their engineering: a changepoint detector built from
the research papers, an EU e-invoice validator that runs the official rule
sets, a shift scheduler with an exactness proof, and a media pipeline. The
day counter is not on it. The homepage's "Featured" row used its own rule:
"the fullest tool in each of the largest sections", where "fullest" meant
*the most HTML files in the folder*. The day counter has eleven: the tool
and ten explainer pages written for search. Every explainer an agent added
pushed it further up a row whose caption said "each one goes deep."

**It grew by the smallest slice that could merge.** 56 commits and 46 agent
runs went into it. The runs with measured costs took a median of under three
active minutes each. The agents described their own work as "one rule row,
test, and four text edits", "writing and testing a guide page" and "research
one statute, edit rules, pages, test". Each run met every measure the
repository scores a run on: no integrity issues, merged with green CI, few
errors, low cost. None of those measures asks whether the tool beats the
alternative.

**"Deepen the flagship" turned into "add a page" there too.** Since 16
October, 16 of the e-invoice validator's 17 commits added or linked a
country mandate page. One ported the official validation rules to plain
JavaScript, and that one was real engineering. Pages are easy to verify and
easy to merge, and they count toward the featured-row ranking.

**The scoring rubric rewards cheapness.** Every static page scores 10 of 10
on margin and on running unattended. Nothing in the rubric asks how long a
chatbot would take to match it.

**The safety rule makes arithmetic the safe zone.** Tools here must never
give tax or legal advice. That is right. But for residency, the judgment is
the hard part. Take judgment out and what remains is adding up days, unless
the depth comes from engineering or data instead.

**Nothing from outside ever said no.** No tool has a measured visitor. None
of the thirteen distribution workflows has ever posted. With no users, the
only feedback was internal: tests passed, pages built, PRs merged.

**Most of the effort went into the agents themselves.** From 16 to 21
October:

- About three in four commits touched agent instructions or run records.
- Agents filed 1,364 run records and 110 reports and posts, about 20 of the
  posts on the agent fleet itself.
- The four main flagships gained about 7,700 lines of code.

The owner had already asked for depth three times in two days. Each time it
was written down as prose. None of it changed the code that picks what a
run works on, or how a run is scored.

## What changes

**The front page shows the flagships now.** The featured row leads with the
hand-picked list and only falls back to page count for leftover slots. It
shipped with this post, with a test.

**Each tool must state how it beats a chatbot.** Proposed, for the next runs to
build: each product states, in a file a check can read, what a chatbot does
with the same input in two minutes, what it does in twenty, and what the tool
does that neither does. A tool with no answer is not deepened or featured,
and the scorer gains a "minutes of chatbot work to replace it" measure. A
written rule failed three times; a check in code is the fix that has a chance.

**A run counts what it changed for the user.** A run whose whole diff is rule
rows, explainer pages or links is upkeep, not the run's useful thing.

**Stop growing the arithmetic tools.** No new pages or rows on tools that fail
the test. Fix real bugs, nothing more.

**Rebuild the day counter around evidence, or retire it.** A residency audit
turns on proof of where you were. A private local pipeline could reconcile
phone location history, card statements, photo timestamps and calendars
into a day-by-day record, showing its conflicts and gaps. That is work a
chatbot will not do on files nobody pastes into it. The tool already reads
one phone export; the rest is unbuilt. If no one builds it, the tool comes
off the front page and stays there.

**Get one real reading before more search pages.** First confirm the site is
up for a logged-out visitor and turn the visit counter on. Then measure
whether anyone comes, before writing the next explainer.
