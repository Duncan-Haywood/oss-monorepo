---
title: "A budget alert that missed by a third of a trillionth of a dollar: six boundary bugs our tests did not see"
seo_title: "Mutation testing an LLM spend guard: six boundary gaps"
date: 2026-11-13
tags: [redteam, testing, llm-spend-guard, webhook-relay, ticket-resale-profit-calculator]
description: "We seeded 24 faults into three products. The tests caught 18. All six escapes sat on a boundary, and one of them depends on floating-point sums."
---

Today's red-team run seeded 24 small faults, eight in each of three files, and ran
each product's own test suite against each one. The files were the spend guard
in `llm-spend-guard`, the signature checks in `webhook-relay`, and the profit
engine in `ticket-resale-profit-calculator`. The suites caught 18 of the 24
(75%). After six new tests they catch all 24.

Every fault that got through was on a boundary:

| Product | Fault | What a user would see |
|---|---|---|
| llm-spend-guard | `maxOutputTokens > 0` became `>= 0` | A request with `max_tokens: 0` would be priced as $0 of output and skip the "no output cap" refusal |
| llm-spend-guard | default repeat window 300 s became 301 s | A repeat exactly five minutes later would trip the loop breaker |
| llm-spend-guard | alert tolerance `1e-12` became `1e-13` | A 90% budget alert would never fire (below) |
| webhook-relay | Linear's replay window `>` became `>=` | A webhook exactly 300 s old would be refused, unlike every other provider |
| ticket-resale | `listPerTicket < 0` became `<= 0` | A $0 list price (giving tickets away) would throw |
| ticket-resale | default `skipped = 0` became `1` | Hand-built rows would report one skipped line |

## The float one

The spend guard compares spend against each alert line with a tolerance:
`after >= line - 1e-12`. It looks like belt and braces. We wanted to know
whether any real spending pattern needs it, so we searched a few budgets,
prices and call sizes for one whose exact total lands on the line but whose
floating-point sum comes up short.

One did: a $100 daily budget with an alert at 90%, and 400 calls of 3,000
output tokens each at $75 per million tokens. Each call costs $0.225, and 400
of them are exactly $90. Added up one at a time in doubles, they come to
$89.99999999999963, which is 3.7e-13 short. With the tolerance at 1e-12 the
alert fires. At 1e-13 it never does, and the person who set the alert finds out
from their bill instead.

The new test runs those 400 calls through the guard and asserts the alert
fires. It fails with the narrower tolerance and passes with the shipped one.

## What we did not find

We also read the proxy, the provider adapters and all 14 webhook signature
schemes as an attacker would: missing headers, non-numeric timestamps, `n > 1`
on OpenAI, zero caps, a cancelled hold, an expired hold. Each of these was
already handled, and most already had a test. This run found no real defects,
only gaps in the tests. The run record is
`prompts/runs/2026-11-13-session_01E5sJKnGpUHHHEW2JLJ2NUU.json`.
