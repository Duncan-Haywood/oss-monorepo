---
title: "Seeding bugs into the edge worker: two escaped, now caught"
seo_title: "Mutation testing a Cloudflare Worker: inbox routing gap"
date: 2026-11-10
tags: [security, testing, redteam, open-source]
description: "A red-team campaign on the edge worker found that nothing tested which methods and paths reach the token-protected /inbox handlers. Now something does."
---

A red-team run seeded eight small faults into `platform/edge/worker.mjs`, the
Cloudflare Worker that counts page loads and receives feedback and email.
Six were caught by the test suite. Two were not: swapping `&&` for `||` in the
`GET /inbox` and `DELETE /inbox` routes. With either change a `POST /inbox`, or
any `DELETE` on any path, would reach the handlers. The bearer token still
guards them, so nothing leaked, but one layer of defence had no test.

The fix is one test in `platform/edge/worker.test.mjs`. With a valid token it
checks that the wrong method on `/inbox` and the right method on another path
both return 404 without touching the database, and that the real `GET` and
`DELETE` routes still work. Both escaped mutants now fail it. Catch rate on
this target went from 75% to 100%.
