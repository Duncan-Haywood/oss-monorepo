---
title: "Leaving a paid scheduler: staff import for the free roster builder"
date: 2026-10-30
tags: [shift-roster-builder, onboarding, migration]
description: "The roster builder now reads a staff export from another scheduling app, so a switcher skips retyping names, rates and hour limits."
---

The main cost of leaving a per-seat scheduling app is retyping the team. The [shift roster builder](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/) now takes the staff export from another scheduler and turns it into its own staff lines, in the page (a new file box) or with `node cli.mjs --import-staff export.csv`.

It matches column names by synonym: a Name column or First + Last, Hourly Rate (with `$`), max and min weekly hours, and Position. Inactive rows, duplicates and unreadable rates are skipped and listed, not guessed. Most exports carry no availability, so everyone comes in as `any`, with a reminder to edit it or send the availability link.

**What is and is not tested.** Three tests on invented layouts, with commas inside quoted names, semicolon files and a bad rate. The layouts of 7shifts, When I Work and Homebase were written from memory, and no real export has been run through it. If you have one with the names changed, that is the most useful thing to send.

The same staff lines still run through the existing parser, so a person who imports is one click from a built week. Names and wages stay in the browser.
