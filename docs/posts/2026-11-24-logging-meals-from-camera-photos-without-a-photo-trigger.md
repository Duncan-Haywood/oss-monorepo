---
title: "iOS never tells an app a photo was taken. Logging meals from Camera photos anyway"
seo_title: "Automatic food logging from iPhone Camera photos to Apple Health"
date: 2026-11-24
tags: [photo-nutrition-agent, ios, healthkit, mcp, chatgpt, nutrition]
description: "An open-source agent turns iPhone Camera photos into Apple Health nutrition that ChatGPT can correct, with no photo trigger and no duplicate samples."
---

The brief was blunt: the only thing the person should ever do is take a photo of their food with the normal Camera app. No upload, no app to open, no shortcut to run, no confirming routine meals. Then the meal should appear in Apple Health, and ChatGPT should know about it and be able to fix it.

The first thing the research turned up is that iOS offers no event for "a photo was just taken". An Apple engineer [put it plainly on the developer forums](https://developer.apple.com/forums/thread/833067): an app is not told about photo library changes while it is in the background or killed; it hears about all of them at once when it next comes to the foreground. No permission and no entitlement changes that.

So the new [Photo Nutrition Agent](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-nutrition-agent) is built out of three pieces that each do one part of the job.

## Exactness: a persistent change token

PhotoKit's [persistent change history](https://developer.apple.com/videos/play/wwdc2022/10132/) (iOS 16+) answers "what was added since I last looked?" from a token the app stores. It does not matter what woke the app, or how long it was asleep. Each run reads exactly the photos it has not seen, and stores the new token only after those photo ids are safely in its own queue. If the history was pruned during a long gap, the call throws `persistentChangeTokenExpired`, and the agent falls back to a date query.

That makes the question "when does the app get to run?" a matter of speed, not of correctness.

## Speed: leaving the Camera is the trigger

Shortcuts has no photo trigger, but it has an app trigger: *Camera is Closed*. Since iOS 15.4 a personal automation can [run without asking and without a banner](https://www.macrumors.com/how-to/turn-off-notifications-automations-shortcuts). Pointed at an App Intent that never opens the app, it gives the agent a few seconds each time the person leaves the Camera. In those seconds it reads the new photos, classifies them on the phone, and uploads the food. Background refresh tasks and app launches catch up anything the automation missed.

It is set up once and then never touched. Whether it fires reliably enough on current iOS is the first thing the owner's 14-day trial will measure. Apple's new iOS 26.1 [background upload extension for Photos](https://developer.apple.com/documentation/photokit/uploading-asset-resources-in-the-background), which the system schedules by itself, is the candidate for removing even that setup step once its limits are known.

## Privacy: two stages, and only one leaves the phone

Vision's built-in image classifier runs on the iPhone, for free, and decides whether a photo is food. A quick text pass catches nutrition labels. Screenshots of a friend's group chat, documents and pets never leave the phone. Likely food goes to the user's *own* server, downscaled to about 1024 px and re-encoded without EXIF or GPS. There, a vision model returns items, grams, nutrients, an energy range, and two judgements that matter for honesty: how likely the photographer is to be eating this (not a menu, a shop shelf or someone else's plate), and whether it is a new meal or another angle of the last one.

Unsure meals are kept as *provisional*, out of the totals and out of Apple Health, until confirmed. Each item records where its numbers came from: a visual estimate, a label, a reference table or the user. The model's energy figure is also checked against its own macros (4/4/9 kcal per gram). An estimate that disagrees with itself loses confidence.

## Corrections without duplicates: HealthKit's sync version

The part that turned out simplest is the one that looked hardest. "That steak was actually 12 ounces" has to change the record *and* Apple Health, without leaving the old calories behind. HealthKit already has the primitive: save a sample with [`HKMetadataKeySyncIdentifier`](https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier) and a [`HKMetadataKeySyncVersion`](https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncversion), and a later save with the same identifier and a higher version replaces it.

So the server is the source of truth, and every correction makes a new meal version. The phone writes one sample per nutrient, `pna:<meal>:<nutrient>`, versioned by the meal. A retry after a half-finished write skips the samples already at that version, and a deletion removes by identifier. ChatGPT can only reach a server, and HealthKit can only be written from the phone. Keeping the records on the server and treating Health as a versioned projection resolves both constraints.

## ChatGPT: MCP, with a fallback

The server exposes 20 tools over MCP: daily totals, meals, corrections, pending reviews, weight trend, an energy-balance estimate with a 95% interval, DEXA history and sync status. It handles OAuth 2.1 with PKCE and dynamic registration, which is what ChatGPT's developer mode and Claude's custom connectors expect. Whether ChatGPT *Plus* gets MCP write tools was contradictory across sources this month, so the same tools are also served as REST with an OpenAPI document. A Custom GPT's Actions can use that on any paid plan, in the iPhone app.

## What is and isn't shown yet

The server side is real and tested: 36 tests drive photos through the device API, the pipeline, SQLite and MCP over HTTP. They cover duplicates and bursts, outages that retry, labels that attach to the meal they belong to, a time-zone change, OAuth, and corrections that come out as a newer HealthKit version. The iPhone code is written but has not been compiled yet, because the session had no Mac. The vision call has been shape-tested but not run against a live key. The [acceptance matrix](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-nutrition-agent/docs/acceptance.md) says which is which. It also sets out the two-week trial that will measure how much of this is actually automatic.
