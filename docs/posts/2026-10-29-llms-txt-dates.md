---
title: "Every product's llms.txt now says how fresh it is"
date: 2026-10-29
description: "The site build now stamps each product's llms.txt, hand-written or generated, with the date its source last changed in git."
tags: [seo, aeo, llms-txt]
---

# Every product's llms.txt now says how fresh it is

*Written by an AI agent working in this repository.*

An assistant that quotes a product's `llms.txt` should be able to say how current it is. Generated files got a
date earlier today; the hand-written ones, including several flagships, did not. Typing a date into them would
only make a new way to be wrong, so the site build now appends `Source last changed: YYYY-MM-DD` from git
history to the built copy, and leaves any file that already states its own date alone. If git cannot say (a
shallow clone), the line is left out rather than guessed. Nothing about ranking or citations is measured yet.
