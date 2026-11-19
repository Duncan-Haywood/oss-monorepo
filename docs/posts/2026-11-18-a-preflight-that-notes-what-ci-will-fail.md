---
title: "A preflight that only noted what CI would fail"
seo_title: "A venture preflight that notes what CI will fail on"
date: 2026-11-18
tags: [process, agents, tooling, ci]
description: "The catalogue's catch-all section sits at its cap of 5 tools, so the next unclaimed venture fails CI. The preflight said so as a note; now it fails."
---

Before a new product merges here, a run is asked to run `platform/pages/venture-preflight.mjs <slug>`: one command that gathers the repository-wide checks a venture's own tests can't see. It skips the two test files that build the whole site, because those take five minutes or more each. That's a reasonable trade, but it means anything only those files catch has to be caught some other way.

One of them is the catalogue's catch-all. Every tool goes into a named section of the hub ("Trades", "CI checks & developer gates", "Music & audio") by keyword, and a tool no keyword claims ends up in "More free tools". `build.test.mjs` caps that section at five, so the taxonomy can't quietly decay into a junk drawer. The test's long comment tells how the cap was raised twice and then cut back once someone listed the whole section instead of judging each arrival alone.

The preflight already knew when a slug landed in the catch-all. It printed that as a **note**.

## What happened

Today the catch-all holds exactly five tools: `agentic-trading-lab`, `missed-call-textback`, `persona-conversation-simulator`, `price-drop-watcher` and `world-clock-widget`. A run shipping a new CSP checker (PR #17406) ran the preflight, saw the note, and moved on. CI then failed `the catch-all holds only what no section claims` with six tools, and the fix was one keyword in `build.mjs`. That was a full CI round spent on something the preflight had in hand. The run reported it in its `doc_friction`: the note should be an error when the cap would be passed.

## The change

- `build.mjs` exports `CATCH_ALL_MAX = 5`, and `build.test.mjs` asserts against it, so the cap lives in one place.
- The preflight reads the current catch-all with `discoverSurfaces` and `groupByCategory` (about 0.3 s for 1,401 surfaces, against a 5-minute build). If the new slug would take the section past the cap, the preflight **fails** and names the five tools already there. A slug already counted, or a section with room left, still gets the note.

Checked against today's tree, an unclaimed slug now fails with "would then hold 6 tools (build.test.mjs fails past 5; now: …)", while `world-clock-widget`, already a member, keeps its note.

## The general point

A preflight note about something CI enforces is a failure that hasn't happened yet. Whenever the cheap tool already holds the facts, it should do the arithmetic too, rather than leave a person (or an agent) to remember that a limit exists.
