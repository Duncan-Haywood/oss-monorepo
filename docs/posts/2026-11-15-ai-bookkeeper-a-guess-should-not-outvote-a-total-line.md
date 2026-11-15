---
title: "Three guesses outvoted one printed total, so guesses now count half"
seo_title: "Receipt OCR voting: weigh a guessed total below a TOTAL line"
date: 2026-11-15
description: "Receipt OCR readings that only guessed the largest amount now count half in the vote: 145 to 150 of 196 US receipt photos right, scans unchanged."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

The ai-bookkeeper reads receipt photos in your browser with tesseract.js, and nothing leaves your machine. Each photo is read four times: the photo and a grey copy, each in two modes (or, on a shaded photo, with two thresholds). Then the four readings vote on the total.

The vote was simple. A value got a point for every reading that read it, another point for every reading that printed it on a TOTAL line, and one per arithmetic check that agreed with it (subtotal plus tax, cash less change, the items added up).

## Where it went wrong

When a reading can't find a total line, the reader falls back on the largest amount on the page. On a phone photo that is often the cash handed over, a card number or noise. And because the four readings come from the same photo, they tend to make the same mistake together.

On one US restaurant receipt the readings came back like this:

| reading | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| total | 19.75, guessed | 19.75, guessed | **21.76, from "Total 21.76"** | 19.75, guessed |

Three guesses scored 3 and the printed total scored 2, so the page showed 19.75. Four of the photos it got wrong looked like this, with one reading that saw the TOTAL line and several that guessed.

## The change

A reading whose total is only the largest-amount fallback now counts half. Nothing else changed. With two readings (the command line's `--two-pass`) there is no vote, so that path is untouched.

I picked the weight on the even-numbered half of ExpressExpense's 196 labelled US receipt photos and scored the odd half held out. Guess weights of 0.75, 0.5 and 0.25 tied on the even half (72 to 73 of 99), and I took the middle one. In fairness, the same grid also printed the odd half, so I could see it while choosing between the tied settings. All of them scored better than before on it.

| totals right | before | now |
|---|---|---|
| page, 196 US receipt photos | 145 (74.0%) | **150 (76.5%)** |
| page, held-out odd half | 73 of 97 | **77** |
| page, 625 SROIE flatbed scans | 529 | 529 |
| command line `--four-pass`, 196 photos | 146 | 147 |
| command line, held-out odd half | 72 of 97 | 71 |
| command line, 625 SROIE scans | 514 | **516** |

On the page, five photos were fixed and none broken. Wrong totals shown with no warning stayed at 3 of 196. The scans didn't move on the page: an evenly lit scan almost always has its total line, so nobody is guessing.

The command line uses the tesseract binary, whose readings differ, and the result there is mixed. It gained one overall and lost one on the held-out half. On the photo it broke, the right total was a guess in one reading, and a garbled "AROUNT Due" line in another read 44.00. Halving the guess let the garbage line win. On the scans, which I never looked at while choosing, the command line gained two totals, so I kept the change there too rather than tuning a second weight for the binary on the same 196 photos.

## What's left

On 17 photos the right total is somewhere in the page's text and still loses. Most of them have no total line in any reading, so the vote has nothing to tell a good guess from a bad one. Two are letter swaps on the total line itself, like "Balance Due A7.90" read as 7.90 twice against one clean 47.90. Those are next.

Numbers, the full grid and the commands to reproduce it: `ventures/ai-bookkeeper/eval/guess-vote-2026-11-15.md`.

*The ai-bookkeeper is free and MIT licensed. It is a bookkeeping aid, not tax or accounting advice. Check every total it reads before you rely on it.*
