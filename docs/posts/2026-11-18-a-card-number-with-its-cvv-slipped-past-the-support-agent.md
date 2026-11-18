---
title: "A card number with its security code after it slipped past our support agent's card check"
seo_title: "Why a Luhn regex misses a card number typed with its CVV"
date: 2026-11-18
tags: [ventures, support-agent, redteam, security]
description: "A card number typed with its CVV ran into one long digit run, failed Luhn and was answered, not handed off. Fixed, with cut numbered steps."
---

The [Support Agent](https://marisstella.app/support-agent/) answers customer questions by copying
sentences from your help articles. Some messages it should never answer. One of those is a message
holding a card number: the customer is told not to send card numbers in chat, and the message goes
to a person. The check behind that was the usual one. Find 13 to 19 digits, allowing a space or dash
between them, and run the Luhn checksum.

Today's red-team run seeded ten faults into `agent.mjs`. The tests caught six. While writing tests
for the four that got through, we fed the check what customers actually type:

| Message | Before | After |
|---|---|---|
| `card 4111 1111 1111 1111 exp 12/29` | caught | caught |
| `card 4111 1111 1111 1111 123` | **missed** | caught |
| `4111 1111 1111 1111 12 29 please charge it` | **missed** | caught |
| `my ssn is 123 45 6789` | **missed** | caught |
| `order 1234 5678 9012 3456` (fails Luhn) | not a card | not a card |
| `call 555 123 4567 or 555 765 4321` | not a card | not a card |

## Why the regex missed it

`/\b(?:\d[ -]?){13,19}\b/` is greedy. On `4111 1111 1111 1111 123` it takes all 19 digits, the
card plus the security code. That 19-digit number fails Luhn. The regex engine has already returned
a match, so it never goes back to try the first 16 digits. The card number passes the check on its
own; with three digits stuck to the end it doesn't.

What the miss cost: the agent searched its articles and answered as if the message were an ordinary
question. When a deployer has connected a model (bring your own key), an answered question is sent
to that provider to be reworded, card number included. The stored question log was safe either way,
because a separate masking step replaces long numbers with `[number]` before anything is saved.

## The fix

The check now splits a digit run into its groups (`4111`, `1111`, `1111`, `1111`, `123`) and tries
every stretch of whole groups that adds up to 13 to 19 digits. A card with a code after it, or an
order number before it, is found. It still tests only whole groups, so a long tracking number does
not pass by chance in some arbitrary 16-digit window. The two "not a card" rows above are in the
tests. The social security number pattern also accepts spaces now, as long as both separators are
the same, so a US phone number (3-3-4 digits) still doesn't match.

## The second bug: steps cut at "1."

One escaped fault changed which line of an extract is checked when deciding whether to join lines
with newlines (so numbered steps stay on separate lines). No test could catch it, because the
sentence splitter broke `1. Open Settings and tap Security.` into `1.` and `Open Settings and tap
Security.` That made the newline join impossible for numbered steps, and an extract that started or
ended at a step could show a stray `1.`. The splitter no longer breaks after a step number at the
start of a line.

## What we didn't ship

The search engine shared with [Help Keeper](https://marisstella.app/help-keeper/) stems `rate` to
`rate` but `rates` to `rat`, and `ship` to `ship` but `shipping` to `shipp`. When the query word
isn't the last one, those short forms never meet. We wrote a stemmer that maps both forms to the
same stem and scored it on the BANKING77 tuning split only. Right answers went from 77, 760 and
1,030 to 78, 791 and 1,011 (with 0, 10 and 40 past questions per topic), with wrong answers flat.
The result was mixed, and shipping it would change the published test-split numbers, so it stays
written up for a run with a help-centre test set where we can measure the gain.

Catch rate on today's seeded faults: 16 of 20 before, 20 of 20 after the new tests. Run record:
`prompts/runs/2026-11-18-session_01EhTJVLiuVJaNagjoZj6A8z.json`.
