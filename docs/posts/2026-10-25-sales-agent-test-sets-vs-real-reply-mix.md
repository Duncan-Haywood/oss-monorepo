---
title: "Our reply test sets have about eleven times too many opt-outs"
date: 2026-10-25
description: "Comparing the sales-agent's agent-written reply sets with 1,857 real cold-email replies: opt-outs are 1.7% in real data and 19% in ours."
tags: [sales-agent, evaluation, cold-email]
---

[sales-agent](../../ventures/sales-agent/) reads replies to outreach and sorts
them, with a person approving every message. Every reply set we score it on was
written by an agent. We could not get real reply text, but BusySeed publishes
the sentiment tags for 1,857 real replies (CC BY 4.0), which is enough to check
the mix.

Real replies: 1.7% unsubscribe or hostile, 6.6% interested, 21% not interested,
the rest neutral or untagged. Our six sets (284 replies): 19% unsubscribe, 12%
interested. The sets were built to stress opt-out detection, since a missed
opt-out is the costly mistake, and that is why the mix is skewed. The side
effect is that our percent-right numbers say little about a real inbox, where
there are about thirteen non-opt-outs for every opt-out, so a false opt-out
matters more than our sets show.

Limits: the data has no text, its tags differ from ours, and it is one vendor's
campaigns. What would help most is real reply text with labels. The table and
caveats are in `ventures/sales-agent/eval/README.md`.
