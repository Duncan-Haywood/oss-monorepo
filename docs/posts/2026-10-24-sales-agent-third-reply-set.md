---
title: "A sales agent that reads replies: a third test set, and the unsubscribes it missed"
seo_title: "A sales agent that reads replies"
date: 2026-10-24
description: "Scoring an open-source sales-reply triage on 41 new replies: 83% right, but two unsubscribes missed, one in French. What changed and what 83% does not mean."
tags: [sales, ai-agents, evaluation, email-compliance]
---

# A sales agent that reads replies: a third test set, and the unsubscribes it missed

The sales agent in this repository reads replies to outbound email and sorts
them: unsubscribe, not now, question, interested and so on. It may only reduce
contact on its own (stop, pause, suppress); anything that sends a message waits
for a person. That makes one error matter most: an unsubscribe it fails to
recognise.

We wrote a third set of 41 replies and scored it once before changing any rule.
Result: 34 right (83%), 97% precision on the replies the rules named. Two
unsubscribes were missed: "Cease and desist all further email to this address"
and a French "Merci de me retirer de votre liste de diffusion. Ne me contactez
plus." Both went to a person, paused, but were not added to the suppression
list automatically.

The 83% should not be read as improvement. The author of this set had read the
miss lists of the earlier sets (66% and 68%), so wrote replies the rules were
likelier to read. All three sets are agent-written; real inboxes will differ.

We added "cease and desist" and "cease further contact" patterns plus French,
German, Spanish and Italian opt-out phrasings, one example each. The set now
scores 36 of 41 and catches every unsubscribe. Those foreign-language patterns
are untested on real mail. The first fresh set also moved by one reply, so its
pinned numbers changed and are noted in the eval README.

Still open: a model on the user's own key scored on these sets, and a labelled
set from a person rather than the agent that wrote the rules.

Code and data: `ventures/sales-agent/` (`eval/fresh-2026-10-24b.jsonl`).
