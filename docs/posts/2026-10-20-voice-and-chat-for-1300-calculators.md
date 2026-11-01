---
title: "Speak to a calculator: adding voice, chat and agent access to 1,300 free tools"
seo_title: "Voice, chat and agent access for 1,300 free calculators"
date: 2026-10-20
description: "Every calculator here can now be filled by voice or a typed sentence, without a model. How it loads nothing until asked, and what its blind tests measured."
tags: [voice-interfaces, accessibility, webmcp, on-device-ai, ai-agents]
---

# Speak to a calculator

Most of this site's 1,300 or so tools are forms: a roofing bid, eBay fees, a
house-cleaning quote. Filling one in means finding and tapping fifteen boxes.
Saying the same thing takes one breath: "2,400 square feet, 8/12 pitch, waste
twelve percent". As of today every calculator here takes it that way, and an
AI agent can use the same form through a published tool interface. This post
covers how it was built so it costs a page almost nothing, and what testing it
honestly turned up.

Like the rest of this repository, it was built by an AI coding agent, with the
owner setting the direction. The direction was: voice and chat are primary
ways in, they load only when the visitor opts in, and their quality and
limitations are published.

## One sentence, many fields, no model

The default needs no AI model at all. A rule-based reader
(`platform/pages/assistant/fill.mjs`) does four things:

- it turns spoken numbers into digits ("twenty four hundred", "two and a half", "$1,250", "67 cents");
- it splits the sentence at commas and "and";
- it matches the words next to each number against the form's own labels, with rarer words counting for more;
- it checks each value against the field's `min`, `max` and `step` before writing it.

When two fields match equally, or a value is out of range, the reader skips
it and says why, rather than guess.

Every value it writes is listed in the reply with the words it was read from,
and an Undo. Then it shows the calculator's own result, which it can read
aloud. A model can be switched on in Settings for looser sentences and
open-ended questions. Its proposals go through the same checks, so a model
can never write a value the form would refuse.

## Loading nothing until asked

Every page already loads one small shared script. The assistant adds about
3 KB to it: enough to show the button and to load the panel (about 75 KB) on
the first click.

Anything bigger waits for a click that says how big it is and where your words
go:

- your browser's built-in model, where the browser has one;
- Qwen2.5 at 290 MB or 880 MB, running in a background worker through WebLLM;
- Whisper speech recognition, 96 MB;
- your own API key, or a model server on your computer.

A browser test of the built site confirmed that a bare visit never fetches
the panel, and that filling a form sends nothing off the site.

Speech recognition is the one place a privacy promise is easy to break by
accident. The convenient browser API sends audio to a cloud service in Chrome.
The assistant never uses that mode. It uses the browser's on-device
recognizer when there is one, and otherwise Whisper running in the page.

## For agents too

Browsers are starting to let a page offer tools to an AI agent (WebMCP,
`navigator.modelContext`). Every page here registers `search_site_tools` and
`read_page_results`. Every calculator also registers `fill_form`, whose input
schema is built from the live form's labels, ranges and choices. An agent
fills the same form a person sees, and a value outside a field's range is
refused, not clamped.

## Measuring it without grading our own homework

The easy number is the pass rate on the test sentences. Today it is 52 of 52,
and it means little, because every miss found has been fixed. So the reader
is scored in **blind rounds**. Sentences are written before the rules are run
on them, scored once, and recorded with the commit that reproduces the score.
Only then are the misses fixed (`platform/pages/assistant/evals.json`).

| Round | Forms | Fully right | Wrong value written |
|---|---|---|---|
| 1 | eBay fees, roofing bid, Amazon FBA | 6 of 12 | 1 |
| 2 | those three, plus house cleaning and mileage, never seen before | 10 of 16 | 4 |

The second round is the more honest one, and its wrong writes are the
instructive part:

- "a one-time clean" read "one" as a quantity;
- "twelve fifty" was summed to 62, when it means 12.50 as money and 1,250 otherwise;
- "67 cents" became 67;
- "listing it at 19" went to the "Promoted listings" field.

All four are fixed now. Whether the fixes generalize is round 3's question.
The Ask page on the site publishes the rounds table, a list of limitations,
and where your words go for each engine.

## What running it caught

Reading the code was not enough; running it was. Six bugs only showed up in a
real browser or worker:

- On the real eBay page, "Items already sold" competed with "Item price" because "sold" was being folded into "price".
- The roofing calculator draws two section rows on load, and they tied with each other.
- A CSS `display` rule kept the panel on screen after it was hidden.
- The small 8-bit Whisper files fail to load in the current ONNX runtime, so the 4-bit build is used. Its transcript of an 11-second clip matched the full-size model's word for word, in about 4 seconds on a CPU.
- 219 calculators take numbers in text inputs marked `inputmode="decimal"`. The assistant missed them until a blind-round sentence landed on one.

## Not done yet

No one has yet watched the on-device model answer. Its download and load
work, but the cloud machine this was built on has only a software GPU, and
generation there did not finish. That check, a third blind round, and scoring
the model engines are listed for the next run in
`platform/pages/assistant/HANDOFF.md`. The full write-up is in
`docs/reports/2026-10-20-site-assistant.md`.

The calculators give estimates from the numbers you type. They are not legal,
tax or financial advice, and the assistant's summary of a result is no
substitute for reading the result itself.
