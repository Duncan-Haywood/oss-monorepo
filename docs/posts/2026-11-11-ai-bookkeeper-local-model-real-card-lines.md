---
title: "A local 7B model on 140 real card lines: worse than the rule it was meant to back up"
seo_title: "Local LLM bookkeeping on real card data"
date: 2026-11-11
description: "On City of Toronto card lines the rules could not settle, Qwen2.5 7B was right on 25-35 of 140 against the rules' 43. The AI layer now fills only blank lines."
tags: [ai-bookkeeper, evaluation, bookkeeping, llm, machine-learning]
---

The ai-bookkeeper sorts bank and card lines into accounts in four steps: your rules,
memory of payees you have filed before, the card's merchant category, and a small
classifier. When those run out, an optional AI layer can ask a language model, either on
your own key or on a model on your own computer. Until today that layer had only been
measured on made-up lines, where a 7B local model filled 7 of 9 blank lines correctly.
This post measures it on real ones.

**The data.** The City of Toronto publishes every purchasing-card charge since 2009, with
the merchant, the card network's merchant category and the ledger account the city filed
it to. Its open-data portal answered today, so I took July 2025 to June 2026: 68,638
charges that map onto a small business's chart of accounts. (In November 2025 the city
switched to 7-digit ledger accounts; 167 of the new accounts carry the same description
as an old one, so those pair up one to one.) Replayed a day at a time from empty books, the
four steps leave just 307 lines, 0.4%, unsettled: 220 with only a weak guess for a payee
never seen before, and 87 with nothing.

**The test.** I sent an evenly spaced 140 of those lines to Qwen2.5 7B Instruct, run on
four CPU cores with llama.cpp at temperature 0. They went through the same function the
web page calls, in batches of 20. Each batch carried the 40 lines filed just before it as
examples, so the model never saw a later answer. Out of 140:

- the rules' own guess: 43 right
- the model, with the prompt as it was: 25 right
- the model, with the merchant category added to each line: 27 right
- the model, also asked to write the account's name next to its code: 35 right

So the model was worse than the weakest step it was meant to back up. Where the rules had
a guess, letting the model replace it rescued 22 lines and broke 27 to 30. The model's
reasons were often sensible, "electricity or gas service" for a utility, while the account
it chose was not: 6150, which is Wages. It understood the line and then lost its place in
the chart. That is why asking for the name helped, and why a cheap check now drops any
answer whose code and name disagree. In this run the check dropped 7 answers, and all 7
were wrong.

**What changed in the product.** The AI layer's default no longer overwrites the
new-payee guess. It only fills lines that have no suggestion at all. On the same 140
lines that gives 48 right, against 43 for the rules alone and 38 when the model replaces
the guess. The extra 5 right answers come with 35 wrong suggestions on lines that had
none. Nothing the model says is posted until a person accepts it, but that is still a lot
of noise for the reviewer. The page's privacy note now says the merchant category is sent
along with the date, description and amount.

**What it does not show.** This is one buyer, a city rather than a small business, one
model size and one sample of 140 lines. A hosted model such as Claude, GPT or Gemini was
not tried: there is no key in the build environment, so a stranger's result with their
own key could be quite different. The same 140 lines are now a fixed test any later
model can be run against (`ventures/ai-bookkeeper/eval/toronto-ai.mjs`). The city's data
is fetched when the test runs and is not copied into the repository.

The same year also confirms the earlier one-month result: with the merchant-category step,
first-time merchants are right 74.8% of the time, against 60.6% without it. Run each
of sixteen city divisions as its own books, the closest thing here to a small business,
and the figure ranges from 55% to 84%. The small divisions sit at the bottom of that
range. They are also where a better model would help most.
