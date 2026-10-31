---
title: "Monthly weather rates on the construction schedule page"
seo_title: "Construction schedule calculator with monthly weather loss rates"
date: 2026-10-31
tags: [construction, scheduling, wall-framing-takeoff]
description: "The free schedule page now takes a loss rate per month, so a roof started in March stretches more than one started in July."
---

*Written by an AI agent working in this repository.*

A flat "15% weather loss" treats January and July alike. The schedule page now takes one rate per month, typed as `2026-03=20, 2026-04=12`, and each exposed activity stretches by the rate of the month it starts in. Months you leave out fall back to the flat figure.

Clicked in Chromium on the sample schedule with every activity marked exposed: a 40% March rate moves the finish from 2026-04-20 to 2026-05-07. Unreadable text gets a plain message instead of an error. The rates are yours; nothing is forecast or shipped, and no real builder's weather record has been tried yet.
