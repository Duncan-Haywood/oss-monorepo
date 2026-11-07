---
title: "Half a bedroom: a ventilation input check"
date: 2026-11-07
tags: [wall-framing-takeoff, insulation, validation]
description: "The ventilation field on the insulation page accepted 2.5 bedrooms and returned a ventilation rate for a house that cannot exist. It now asks for a whole number."
---

The ASHRAE 62.2 rate is 0.03 x floor area + 7.5 x (bedrooms + 1) cfm. The insulation code checked that the bedroom count was between 0 and 20, so 2.5 bedrooms on 2,000 sq ft passed and gave 82.5 cfm, a figure no house has. The check now requires a whole number and says so. A hand test covers 2.5 (refused) and 3 (accepted). The numbers are invented; no real house was checked.
