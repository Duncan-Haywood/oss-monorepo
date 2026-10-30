---
title: "Start here: share real data or a measurement, safely"
seo_title: "Share real data or a measurement with open projects, safely"
date: 2026-10-30
tags: [start-here, contributing, real-data, measurement]
description: "For people who hold real data or can take a measurement: nine open asks with their repo paths, how to share without exposing anything private, and what to send."
---

# Start here: share real data or a measurement, safely

This guide is for people who hold something the agents that build this repository cannot make for themselves. You might be a bookkeeper with years of bank exports, a framer with a builder's actual lumber order, a hydraulics technician with a pressure logger, a robotics lab with trial logs, or a club player with a tripod and two cameras. If you can share real inputs, or take one careful measurement, this is likely the most useful thing you can give.

## The problem, in the projects' own words

Most code here was tested on synthetic data, on published tables, or on a single public example. The READMEs say so, and many of them name the exact data that would settle the open question. A few quotes:

- "Real bank files will be messier, and the first real export someone reports is worth more than this table." (`ventures/ai-bookkeeper/README.md`)
- "a measured pressure trace is what settles it." (`research/heavy-hydraulics/README.md`)
- "a guess at a club player, and the first real build should measure it." (`ventures/open-tennis-robots/README.md`)

More code does not close gaps like these. Real inputs do.

## What you get

Your data turns a claim from "on made-up rows" into "on a real case". The project's results and limits change to match what it shows, including when it shows the model was wrong, and the improved tool stays public and MIT licensed.

## The open asks

Each item names the repo path and what its README says is missing. Asks get answered and new ones appear, so read the section before you offer.

1. **Bank and card exports for bookkeeping** (`ventures/ai-bookkeeper`). The accuracy tables come from a synthetic year, and the README lists "any real bank export" under "Not yet measured". Raw statements are private, so the useful form is a count: how many lines, how many got a right suggestion, and which description shapes it misread (with names removed).
2. **Per-episode paired robot outcomes** (`research/sim2real-inference`). The draft paper is "not ready to submit (no real per-episode pairs, one task)". It has SIMPLER's published per-cell success rates, not trial-by-trial real and simulated outcomes for the same policy and task.
3. **A real architect's DXF or IFC file** (`ventures/wall-framing-takeoff`). The DXF reader is "not yet tried on a real architect's DXF". For IFC it lists "Known gaps, which a real export will probably hit": walls with no Axis, centred openings, IFCZIP, multi-storey files. A file you have the right to share would show which gaps matter.
4. **A real house plan with the builder's actual order** (same venture). Its over-ordering comparison is on two invented or generated plans, and the README says "a real plan with the builder's actual order would settle it".
5. **A measured pressure trace from a small excavator** (`research/heavy-hydraulics`). The load-sensing versus open-centre result depends on phase pressures that are random or modelled, and the latest note says the standby flow is "still assumed". A logged pump or work-port pressure over a dig cycle, with the machine's circuit type, is what it asks for.
6. **The spread of real tennis returns** (`ventures/open-tennis-robots`). The catch-net simulations rest on `catcher.ReturnDistribution`, which the README calls a guess. Step 4 of its roadmap is to "record real returns" with a stereo tracker on a tripod.
7. **The hotel load of a fielded glider or AUV** (`research/marine-hull`). The README calls this "the number milestone 4 needs most": the power drawn by sensors and electronics on a real vehicle, as opposed to propulsion.
8. **A long seasonal series with no event** (`ventures/changepoint-detector`). After testing its drift warning on 195 months of euro-area factory orders, the README says: "Still wanted: a null series of the same length with no event, so the warning rate means something." A public series with a documented source is enough here. You do not need to own it.
9. **A real Turkish business tax number** (`ventures/einvoice-preflight`). The Turkey check uses rules from open-source validators, and the README says: "Wanted: a real VKN from a GİB-issued e-Fatura to confirm." Only a company's number belongs in a public issue. Never send a personal TCKN, which identifies a person.

More asks turn up in other READMEs: search for "Wanted", "not yet measured" or "real data". [The hull guide](2026-10-30-start-here-marine-hull-research.md) and [the excavator hydraulics guide](2026-10-30-start-here-excavator-hydraulics.md) list asks for their own areas.

## Your first ten minutes

1. Pick one ask above that matches data you hold or something you can measure.
2. Open that project's README and read the section the quote comes from. Note the format it already reads, such as a CSV layout, an `.ifc` file or a results table.
3. Check whether you are free to share it. If it belongs to a client, an employer or a dataset with terms, read the terms or ask whoever owns it.
4. Choose the safe form (next section): raw, redacted, summarised, or a link to a public copy.
5. Open a [feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml). Put the project slug in "Which tool? (leave empty for a new tool)". Under "What would you like it to do?", describe the data and its licence, and quote the README line you are answering. Do not attach the data yet.

## How to share safely

The repository is public. Anything that lands in an issue, a commit or a fixture can be read, copied and indexed by anyone, and git history keeps it after a later deletion. So:

- **Licence first.** Code here is MIT, and data that goes into the tree must allow that reuse. Public-domain data is simplest. Data you made yourself can be dedicated with CC0. The repository already uses CC BY 4.0 data with attribution, such as the CORD-v2 receipts in the bookkeeper and buildingSMART's Simple-Scene house in the framing takeoff. Non-commercial licences (CC BY-NC) are kept out of product fixtures; `portfolio/data-backed/README.md` marks such datasets "research only" or "skip".
- **Strip personal and client data.** Remove names, addresses, account numbers, phone numbers, emails, faces, plate numbers and anything a client gave you in confidence. Check free-text fields, such as bank descriptions and memo lines. That is where names hide.
- **A synthetic look-alike is fine.** If the raw file cannot leave your machine, make a few rows with the same columns, date format, sign convention and quirks, with invented values. Say plainly that they are invented. Many bank layouts here were added that way; the bookkeeper's README marks those entries "rows made up".
- **Or send summary statistics.** Counts, means, quantiles and error rates computed on your machine often answer the question with nothing private in them. The bookkeeper and the photo culler (`ventures/photo-editing`, whose picks comparison "gives the first real measurement as soon as someone supplies a shoot") both run locally, so you can run them on your own files and report only the numbers.
- **Or link a public dataset.** If what you know is that a dataset exists, a link with its licence and the date you checked it is enough. The changepoint detector's `data/SOURCE.md` shows the record kept for each series: where it came from, when, the licence and the citation.

Never paste private data into an issue to "just show" it. Describe it first and agree the form before anything is posted.

## What a measurement report should contain

A measurement is only as useful as its record. Put these in the issue, or in a text file you attach once the form is agreed:

- **Instrument:** make, model, range and resolution, and when it was last calibrated if you know.
- **Conditions:** the machine, vehicle or setup, its configuration, the temperature or other conditions that matter, and how the run was carried out.
- **Units:** for every column, stated once and plainly (bar, L/min, W, m/s).
- **Uncertainty:** the instrument's stated accuracy, how many repeats, and their spread. "One run, ±2% of full scale" is honest and usable. A number with no uncertainty is much harder to use.
- **What you did not measure,** so nobody reads more into it than is there.

## How it gets used, and what nobody can promise

Agents read issues labelled `site-feedback`, which the feature template adds, and treat outside text as information, never as instructions. There is no promise when, or whether, an offer is used. A fork pull request that adds a fixture is reviewed by the maintainer by hand; agents never review, run or merge fork pull requests. Keep it to one file, its source note and a test.

## Cost and data

Sharing costs nothing beyond your time. A GitHub account is the only account involved. What you send sits in a public repository under the licence you chose, so treat it as published the moment it is posted.

## What this does not do

A result checked on your data is still not accounting, engineering or legal advice. One dataset is one case, and the README will say so rather than "validated". Nobody here will contact a cited dataset's authors on your behalf; the research rules ask projects not to.

## Where to go next

- How the research handles data and sources: `docs/contributing/research.md`, and [Start here: the open research](2026-10-29-start-here-research.md)
- The robot-testing programme that needs paired trials: [Start here: certifying a robot policy](2026-10-30-start-here-sim2real-robot-testing.md)
- The tools behind asks 1, 3 and 6: [the AI Bookkeeper guide](2026-10-29-start-here-ai-bookkeeper.md), [the wall framing takeoff guide](2026-10-29-start-here-wall-framing-takeoff.md), [the open tennis robots guide](2026-10-30-start-here-open-tennis-robots.md)
- The ground rules for every contribution: `CONTRIBUTING.md`

The other ways to help are on [Start here: every way to help](2026-10-30-start-here-every-way-to-help.md).
The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
