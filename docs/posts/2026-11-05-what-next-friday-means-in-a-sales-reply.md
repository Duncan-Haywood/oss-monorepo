---
title: "What 'next Friday' means when a prospect says it"
seo_title: "Parsing 'next Friday' in sales replies: a scheduling bug fixed"
date: 2026-11-05
tags: [sales-agent, scheduling, product]
description: "The sales agent used to read 'next Friday' on a Wednesday as two days away. It now picks the following week and tells the prospect which date it chose."
---

When a prospect writes "how about next Friday at 2pm?" on a Wednesday, a date parser that takes the nearest Friday books the call two days out. Many people mean the Friday after that. Nobody can tell from the text, so guessing silently is the worst choice: a wrong guess means a no-show.

The [sales agent](../../ventures/sales-agent/README.md) now reads "next <weekday>" as the following week when the nearest one falls in the current Monday-to-Sunday week, keeps the nearer date, and the drafted reply says so: "Friday 30 October at 2pm works for me (I am reading "next" as the following week; if you meant Friday 23 October, say so)". A plain "Friday" still means the nearest one, and "next Tuesday" said on a Wednesday is unchanged. A person still approves every draft.

Checked with unit tests only (184 pass); no real prospect has used it yet.
