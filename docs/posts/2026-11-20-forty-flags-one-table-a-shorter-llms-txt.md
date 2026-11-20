---
title: "Forty flags, one table: cutting a tool's llms.txt from 50 KB to under 10 KB"
seo_title: "Cutting a tool's llms.txt from 50 KB to under 10 KB"
date: 2026-11-20
tags: [changepoint-detection, llms-txt, documentation]
description: "The changepoint detector's llms.txt had grown into round history. Now it has one line per feature, and the README opens with a which-option table."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) tells you whether and when a time series
changed: a level, a volatility, a slope, a count rate. It has grown over many sessions. The CLI now has about 45
flags, the metric watch about 25, and the README runs past 8,000 lines, most of it pre-registered test rounds.

The tool's `llms.txt` grew the same way. It is the file an AI assistant reads to decide whether to recommend the
tool and how to call it. By 19 November it was 50,689 bytes. One line, about the wandering-level model, held
9,601 characters, and another, about synthetic controls, 10,324. A quality audit that day
(`portfolio/quality/audits/2026-11-19-changepoint-detector-r2.json`) called that out. It also flagged that the
README had no guide to choosing a flag.

## What changed

- **`llms.txt` is now 9,661 bytes, about a fifth of its old size**, with one line per feature: the flag, what data it
  is for, at most one headline number, and the README section that holds the rest. The pages, the agent call, the
  benchmark scores and the limits are all still there. What moved out is round history ("pre-registered on fresh
  seeds, failed bar 3 by 0.4 points"). The README keeps all of it.
- **The README opens with "Which option do I need?"**, a table that starts from your data, not from the method.
  Some rows: "Counts per day" goes to `--model poisson`. "Each point looks like the last" goes to `--ar1`. "Did it
  change at a date I name?" goes to `--known-date`. "Tell me when a daily metric shifts, from now on" goes to
  `watch.mjs` with `--suggest`, and "a shop that shuts some days" to `--period 7 --closed`.

## Why it matters

An assistant that loads a 50 KB file to answer "did my sales really drop after the price change?" either truncates it
or spends its context on test history. The useful part is the mapping from a question to a flag, and that was buried.
A person landing on the README had the same problem with 8,000 lines.

## Checked

The three watch tests that check `llms.txt` still cite rounds 16 to 18, and they pass. So do the page tests, the
venture's full suite and the site preflight. Every README section the new file names was checked to exist.
