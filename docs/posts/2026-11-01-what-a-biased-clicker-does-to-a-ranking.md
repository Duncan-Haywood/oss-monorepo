---
title: What a person who always clicks the top option does to a ranking
date: 2026-11-01
---

Quick Pick Survey ranks items by asking people "which of these two?" over and over. Real people get lazy: some tap the top option most of the time. We ran synthetic respondents through the real question and answer routes against Postgres to see the damage.

Sixty items, 200 answers each, three respondents per case, a hidden true order. The rank match (Spearman) was 0.77 for a careful person, 0.71 when one answer in five was random, 0.53 when half the answers were "top option", and 0.07 when 80% were. The app shuffles which slot each item lands in, so a careful person's top-slot share sits at 0.51 and a lazy one is plain to see at 0.76 to 0.93.

What we did not measure: how much the app's built-in fallback for lazy clickers saves, because there was no run with it switched off. That is the next test. Numbers, limits and the command to reproduce are in the venture's `docs/INFORMATION-GAIN-SELECTOR.md`. All answers were simulated.
