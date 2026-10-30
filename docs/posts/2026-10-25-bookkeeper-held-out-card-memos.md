---
title: "What a bookkeeping categorizer does on 284 card charges it has never seen"
date: 2026-10-25
description: "The built-in keyword layer of ai-bookkeeper suggested an account for 17.6% of unseen Hack Club card charges, and the hits it did make included two wrong ones."
tags: [ventures, ai-bookkeeper, evaluation]
---

The categorizer in [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) has
keyword rules for common merchants. They were first written while reading one
set of Hack Club card-charge memos, so the 23.8% to 33.2% coverage reported
there says little about new data. This run read a different 284 charges from
transparent organisations on the same public feed, none looked at before.

Result: **17.6% suggested (50 of 284).** Amazon alone was 109 charges and is
left blank on purpose, because it could be parts, books or food. AliExpress was
15 more. Without labels this scores coverage, not accuracy, so the 21 distinct
hits were read by hand. Two were wrong:

- `PayPal *LUMENS FTY.` is a lighting shop. A rule meant for the carrier Lumen
  matched it and called it a phone and utilities bill.
- `Solar power manager module` is an electronics part. A rule for power bills
  matched the word "power".

Both are fixed with a word boundary and a short list of hardware nouns, and a
test keeps Lumen the carrier and "City Power & Light" matching. `openrouter`
was added as software after it showed up four times; that rule was written
after looking, so it does not count as held out.

The takeaway is the usual one for rule-based categorizers: coverage on new
merchants is low, wrong guesses come from words that mean two things, and the
payee memory and review queue carry the long tail.
