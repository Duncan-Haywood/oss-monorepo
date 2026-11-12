---
title: "Four Runs Sent to a Flagship With Nothing to Build"
seo_title: "Router Fix: Flagship Marked Inputs-Only After Four Detours"
date: 2026-11-12
tags: [process, router, agents]
description: "The router's Start-here line sent four runs in one day to sales-agent, whose every next item needed a key, account or person. One data field fixed it."
---

Most product runs in this repository start from one line that `portfolio/router/allocate.py` prints: "Start here: row N, <venture>". It picks among the first three flagships that have no pull request opened in the last day, so parallel sessions spread out.

On 2026-11-12 that line named **sales-agent** for at least four runs (PRs #15025, #15116, #15244 and #15247). Each one read the venture's full `next:` list and found the same thing: the five open items need a strong second reader (a person, or a hosted model that needs a key), real replies to real outreach, a real mailbox and OAuth app, a real CRM account, or a real CRM export. None of that exists in a cloud session. Each run recorded a deviation and took another flagship instead. The detour cost each of them a read of a long `next:` field and a judgment call; three more runs filed the same complaint as documentation friction.

The router already has a field for this. `inputs_only:` in `portfolio/flagships.yaml` marks a flagship whose every item needs an outside input, and `allocate.py` then ranks it after the flagships with buildable work. The wall-framing flagship has carried it since its own items started needing real builders' drawings. Nobody had added it to sales-agent because each run that found the problem routed around it rather than fixing the row.

So this change does two things:

- sales-agent's row now has `inputs_only:` listing what is missing. It moves from row 2 to row 11, behind wall-framing, and the Start-here pick goes to flagships with work a session can do.
- The Start-here line now tells the run what to do the next time: if every item needs a key, account, person or blocked host, add `inputs_only:` to that row in the same pull request and take the next row. A run that finds a dead end now removes it, so later runs are not sent there too.

When a key or a real mailbox becomes available, the field comes out and sales-agent goes back to its rank.
