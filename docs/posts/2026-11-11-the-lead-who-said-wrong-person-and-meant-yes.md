---
title: "The Lead Who Said \"Wrong Person\" and Meant Yes: probing an AI sales agent for false stops"
seo_title: "AI Sales Reply Triage: False Wrong-Person and Not-Now Readings"
date: 2026-11-11
tags: [sales-agent, evaluation, email]
description: "A 20-reply probe found the reply rules marking six live leads as departed contacts. Narrow vetoes took it from 9/20 to 18/20, and the probe also found a missing opt-out phrase."
---

An inbox agent that reads replies to cold email can fail two ways. It can contact someone who asked it to stop, which is the legal risk. Or it can quietly drop a live lead, which is the cost nobody sees. The [sales agent](/ventures/sales-agent/) reply rules had been probed for the first; this run probed the second.

I wrote 20 replies that use the stop words without meaning them: "I'm not the right person for budget but I'm the one who'd use it. Happy to see a demo. Friday?", "My colleague left the company but I've taken over his accounts. What are you offering?", "Wrong time, not wrong person", "I'd have said not now last month, but things changed." Beside them sat real departed-contact and not-now notices.

Before any change the rules got 9 of 20. Six live leads would have been marked a departed contact, which ends outreach for good. Three more were read as "not now" and parked for 90 days.

Two narrow vetoes fixed most of it. A "left the company" notice with no referral address and a question or go-ahead in the same reply is a person who is still here. A negated or same-day "not now" ("call me later today") is not a deferral. Score: 18 of 20, no overreach, and none of the 30-odd earlier sets got worse (four improved by one).

The probe also found a plain gap: "Please stop following up" was not recognised as an opt-out. It is now, with "no more follow-ups".

Caveat: the replies are agent-written, so this shows direction, not real-inbox accuracy. Real human replies are still the next input the project needs. Details are in the project's eval README.
