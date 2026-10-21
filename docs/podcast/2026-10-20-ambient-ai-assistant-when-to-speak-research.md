---
title: "When should an always-on AI assistant speak?"
date: 2026-10-20
description: "Reply latency, when to interrupt, false wakes a day and pendant battery life: what 46 simulated ambient-assistant studies found."
post: ambient-ai-assistant-when-to-speak-research
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

This episode is about one research track: an ambient AI assistant. That means an always-on helper that listens to the conversation and speaks into your ear only when it would help. The track asks two questions. When should such an assistant speak? And how fast and cheap can the whole thing run on a device?

There are now forty-six small projects in this track. AI coding agents wrote them, with the repository's owner steering. Each one has a write-up with a method, results and limitations, and every number in this episode comes from one of those write-ups.

First, the caveats. Only one project measured real software, and it ran on synthetic speech on a server processor, not a phone. Most of the others are stylised simulations, where the agent chose the distributions. Nothing is fitted to real conversations. So treat these results as the shape of a problem, not as product numbers.

Finding one. A voice pipeline built from small open models replies in about one second. The project chained four stages: voice activity detection, speech recognition, a small language model, and speech synthesis, all on four processor cores. The median time from the end of speech to the first sound of a reply was nine hundred and thirty eight milliseconds with a short end-of-speech wait, and about one and a half seconds with a longer one. Roughly seven tenths of a second is the three models. The rest is the assistant waiting to be sure you have finished talking. The write-up concludes that the roughly two hundred millisecond gap of human turn-taking is out of reach for a design that waits and then runs three models in a row.

Finding two. Starting early hides most of that compute. A follow-up started the models before the wait was over, and held the reply until the turn was confirmed finished. With a one second wait, the median reply fell from about one point seven seconds to just over one second. The cost was roughly one extra pipeline run per turn. Replying the moment the early run finished was faster still, but talked over the speaker in fifty seven percent of turns. The pause lengths in that model are assumed, not measured.

Finding three is about when to interrupt. The project compared policies at the same level of annoyance, meaning the same number of false interruptions an hour. A wake word alone caught only fifteen percent of the moments where help was wanted. Adding a keyword trigger caught more, but caused almost twenty nine false interruptions an hour. The sharper lesson was about simulators. Changing how often people need help barely moved the false-interruption rate. Changing what the signals look like when nobody needs help broke it, raising one false interruption an hour to nearly four. That quiet background is exactly the part a conversation simulator is least likely to get right.

Finding four. A common rule for wake words is badly wrong when the detector's score is smooth over time. If you set the threshold as if each ten millisecond frame were independent, aiming for one false wake a day, and require three frames in a row, the model predicts about four thousand eight hundred false wakes a day instead. The fix is a much higher threshold computed from the exact rate. The score model here is stylised, and no real detector was tested.

Finding five. Learning from your own interruptions is hard. A deployed assistant only gets feedback when it speaks. Starting from no prior knowledge, none of three learning methods found a useful policy in one hundred simulated hours. With a sensible starting point, the simplest method reached ninety percent of the best possible rate after a median of about twenty two hours. And when the intent detector got worse halfway through, the learning policy did far worse than simply keeping its old settings. A later project also corrected an earlier guess that this selection bias did not matter much. It does matter, and the write-up says so plainly.

Finding six is about hardware, and nothing here was measured on a device. In a power model for a small pendant with a one hundred and fifty milliamp hour battery, turning the radio on only during speech gave about one hundred and five hours, against fifty nine hours for streaming all the time. The always-on microphone alone caps the battery at about one hundred and seventy hours. The prototype parts list came to about twenty two dollars before shipping and a case. A port of the voice gate to the C language shrank its memory from about a thousand bytes to one hundred and twenty, with almost no change in what it caught.

What is missing is the same almost everywhere: real recordings, a real phone, and real users. Until those exist, these are design arguments backed by simulation, not engineering or legal advice. Recording-consent law also differs by place, and some American states require everyone's consent.

The written version is on the site's Writing page, with links to every project and its sources.
