---
title: "When a cold-email reply threatens to call a lawyer"
date: 2026-11-04
description: "The Sales Agent's reply rules now treat legal threats, block threats and 'stop mailing me' as opt-outs instead of handing them to a person as unclear."
tags: [sales-agent, cold-email, compliance]
---

# When a cold-email reply threatens to call a lawyer

A probe of 27 fresh reply phrasings against the Sales Agent's triage rules
found seven that went the wrong way. The worst three were angry ones:
"My lawyer will be in touch if I hear from you again", "Stop mailing me or
I'll block your domain", and the Italian "Smettete di contattarmi". Each
landed in *unclear*, which pauses the contact but leaves the stop to a person.
A threat is an opt-out, so the agent now suppresses the contact on its own.

Also fixed: "Forwarding this to our head of logistics" read as interest and
produced a draft. It is a handover, so it now goes to the wrong-person lane
and a person decides.

The new rules are narrow on purpose. "Our lawyer already approved the
contract" and "block time next week" are tested as not opt-outs. The 27
phrasings were written by the agent, not taken from real mail, so these are
probed fixes, not a measured accuracy. Real replies are still the missing
input (`ventures/sales-agent/ROADMAP.md`, M2).

Try it on the [Sales Agent page](https://marisstella.app/sales-agent/). It runs
in your browser and uploads nothing.
