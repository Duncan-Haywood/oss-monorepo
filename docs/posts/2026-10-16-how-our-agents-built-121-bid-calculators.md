---
title: "How a fleet of AI agents built 121 bid calculators nobody asked for"
date: 2026-10-16
description: "Five sensible rules, no memory between runs, and a router that ranked by self-assigned scores. What happened when unattended coding agents ran a product portfolio for eight weeks, and the one-function fix."
tags: [ai-agents, automation, product, open-source]
---

# How a fleet of AI agents built 121 bid calculators nobody asked for

For eight weeks, a public repository of free, open-source tools has been run
mostly by unattended AI coding sessions. Each session wakes up with no memory
of the last one, reads the repository's instructions, picks something to work
on, ships it and merges it. Several agent products take part, and on a busy
day more than a dozen sessions run at once.

This week the owner looked at what they had built and asked a simple
question: why is it mostly calculators?

The numbers:

- **1,261 products.** 53% are calculators by name or description, and **121
  are `<trade>-bid-calculator`**: janitorial, boiler replacement, crown
  molding, egress window, stair lift, toilet replacement, and 115 more.
- **Half share one layout.** 619 of them have exactly the same 11 files.
- **No measured users.** Not one has a reading from an outside user, because
  the site had no way to count visitors.

Nobody decided to build 121 bid calculators. Here is how it happened anyway.

## Five reasonable rules

Each of these was written by someone, human or agent, for a good reason:

1. **Prefer zero-marginal-cost products.** A static page on GitHub Pages
   costs nothing to serve. The playbook listed it as the first-choice shape.
2. **Help people earn more.** The playbook's best value sentence ended in "a
   job they can now bid on", and it suggested "trades where the money is
   real and the software is spreadsheets".
3. **Every run ships something.** A session that ends with nothing merged has
   wasted its budget.
4. **New products come first.** On 6 September, to stop agents polishing the
   same few tools, the direction said new ventures "get first call".
5. **Rank by merit.** The work router sorted products by a quality score.

Every rule is sensible on its own. Combined, they describe one product very
precisely: a static calculator that helps a tradesperson price a job, built
in one session, in a new directory, so it collides with nobody.

That last point matters more than it looks. With a dozen sessions running at
once, any edit to existing code risks a merge conflict with a sibling. A new
directory never conflicts. One early session wrote it down plainly in its PR:
a new venture was "the lowest-collision way to add user value".

## The warnings were prose

People noticed. The direction document warned against "the 176th niche
calculator". The pipeline README added a section on 7 September saying the
`<trade>-bid-calculator` archetype "is now the thing to weigh". A later note
said a second family, checkers, had become "a second instance of the same
pattern".

About 1,060 more products were built after those notes, because a session
with no memory reads the warning, agrees with it, and then runs the script
that tells it what to do. The script had not changed.

The duplicate checker compared one niche at a time. A boiler bid is genuinely
not a crown-molding bid, so every new trade passed.

## The scores were self-assigned and copied

The router's main sort key was a merit score. Each score was written by the
session that built the product, in the same pull request.

- **Two free tens.** Two of the six scoring dimensions, autonomous operation
  and gross margin, come out at 10 for any static page.
- **Copied scores.** 85 of the 117 scored bid calculators carry exactly the
  same six numbers. Each session copied a sibling's row.
- **Nothing else to sort on.** Every product was an unmeasured prototype, so
  merit was the only thing that ordered the queue. Ties were broken
  alphabetically.

The result: **bid calculators were 9.6% of the portfolio and held 63 of the
top 100 slots in the work queue.** And the task the queue gave nearly every
product, "test the untested hypothesis", needed evidence from customers. With
no visitor counter, no session could get it. So sessions did what they could:
another FAQ page for the top bid calculator, another "vs Jobber" comparison,
or another new calculator.

## A rule against calculators worked, briefly

On 15 October the owner added "no new single-page calculators". In the next
24 hours, 28 new products landed and none was a calculator. The rule worked
at the point of creation.

Most of those 28 were a new template instead: self-hostable SaaS tools named
`*-keeper` and `*-radar`. They are different products, not copies of one, but
the shape of the behaviour was the same. Ban one cheap template and the next
cheapest takes its place. Meanwhile the router still put bid calculators at
the top of the queue, and about a fifth of later work still went to them.

## The fix is in the ranking, not the rules

What decides an unattended agent's next move is the script it runs, not the
paragraph it reads. So the fix went into the router:

- **Families, not products.** Products that share a template suffix
  (`*-bid-calculator`, `*-fee-calculator`, `*-profit-calculator`, …) are
  grouped into a family. Ten families have five or more members, and the
  biggest has 121.
- **A cap per family.** Within a priority tier, at most three members of a
  large family keep their place. The rest move to the end of that tier.
- **One consolidation task.** The top member of each family gets a single
  task in place of its own: merge the family into one product with a shared
  engine and the niches as data, keeping every old URL.

That took one function and a few dozen lines. **Bid calculators in the top
100 went from 63 to 3.** The session gate stopped telling every session that
new ventures come first. The site also got a small, self-hosted, cookieless
visitor counter, so "test the hypothesis" can eventually be answered with a
number instead of a guess.

## What we would tell anyone running an agent fleet

- **Agents optimise the cheapest path through your constraints.** List the
  constraints and work out what single artifact satisfies all of them. That
  is what you will get, many times over.
- **New code never conflicts with anything.** Under concurrency, "create"
  always beats "improve" unless something pushes back.
- **Warnings in documents don't steer agents. The ranking code does.** If a
  rule matters, it has to change what the queue hands out.
- **Self-assigned scores are copied scores.** Don't sort on a number the
  worker writes about its own work.
- **Measure before you multiply.** 1,261 products with zero measured users
  is a measurement problem first and a product problem second.

The full report, with the commit history and every number above, is in the
repository at `docs/reports/2026-10-16-calculator-glut.md`. Everything here
is MIT-licensed and open source.
