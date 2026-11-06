---
title: "Paint and fireblocking now reach the bid budget"
date: 2026-11-06
tags: [wall-framing-takeoff, budget, construction]
description: "The open-source framing takeoff budget now includes paint and fireblocking lines, priced from typed prices."
---

The wall-framing takeoff has computed paint gallons and fireblocking boards for a while, but the budget ignored both, so a bid built from `--budget` quietly left them out. Both now appear as budget lines. Each is priced from a typed budget price or from the module's own price setting, and listed as unpriced when neither exists. A test ties the budget quantities to the takeoff's numbers. No real paint or blocking order has been compared yet.
