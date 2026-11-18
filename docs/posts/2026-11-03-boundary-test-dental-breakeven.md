---
title: "The one-character bug our dental calculator's tests missed"
seo_title: "Mutation testing a dental PPO break-even calculator"
date: 2026-11-03
tags: [testing, mutation-testing, dental, open-source]
description: "A red-team run seeded 8 faults into the dental PPO write-off calculator; 7 were caught, and the miss was a boundary at exactly break-even."
---

We seed small faults into calculator code and see whether the tests notice. On the dental PPO write-off calculator, 7 of 8 were caught. The escape changed `<` to `<=` where a plan pays exactly the break-even rate: the page would then have told that practice to ask for a 0% pay rise instead of showing none. No test sat on that boundary. One now does, and all 8 seeded faults are caught.
