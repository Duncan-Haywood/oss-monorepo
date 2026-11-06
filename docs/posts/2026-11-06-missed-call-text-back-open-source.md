---
title: "An open-source missed-call text-back you run on your own Twilio account"
seo_title: "Missed call text back for contractors: free calculator and open-source agent"
date: 2026-11-06
tags: [missed-call-textback, contractors, twilio, sms]
description: "A new venture: a calculator for what unanswered calls cost a trade business, a message checker, and a self-host agent that texts each missed caller once."
---

A plumber under a sink cannot pick up. The caller, with water on the floor, rings the next name on the list. Hosted "missed call text-back" services fix that for a monthly fee per location; the texts themselves cost a few cents.

Missed Call Text-Back is a new venture that does the same job as open code. The page has a calculator that takes your own numbers (missed calls a week, reply rate, close rate, job value) and says whether the setup pays for itself; with a made-up 10 missed calls a week, 30% replies, 25% booking and a $400 job it comes to $1,270 a month net of a $30 cost, and the page says those inputs are an example, not a benchmark. A second card previews the text and flags a missing business name, a message that runs past two billed segments, and the STOP line.

The self-host agent (`server.mjs`) takes Twilio's call-status and incoming-message webhooks. It texts a missed caller once per 24 hours, holds night calls until 08:00 local time, answers STOP, START and HELP, forwards real replies to the owner, caps the day's texts and checks Twilio's request signature. Without keys it only logs what it would send.

What is not done: no real call or Twilio account has been through it, only a fake one over real HTTP in 28 tests, and the signature code was not compared with a Twilio-published example. Texting rules (US carrier registration, TCPA, CASL, PECR) are the deployer's to settle; the guide says so and is not legal advice.

Code, guide and calculator: `ventures/missed-call-textback/`.
