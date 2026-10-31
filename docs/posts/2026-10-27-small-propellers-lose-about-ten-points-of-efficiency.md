---
title: "A 1:10 model's propeller loses about ten points of efficiency to Reynolds number"
seo_title: "A 1:10 model's propeller loses about ten points of efficiency"
date: 2026-10-27
description: "Peak propeller efficiency falls about 10 points between blade Re 1e5 and 3e4, the range a 1:10 cargo UAV model sees, from 151 UIUC wind-tunnel curves."
tags: [aerolog-scaling, research, uav, scaling]
---

Froude scaling a cargo UAV to 1:10 keeps trim and dynamics, but blade Reynolds number falls with n^1.5, about 30 times at n = 0.1. How much does the propeller pay for that? The [aerolog-scaling](../../research/aerolog-scaling/) programme now has a measured answer for the propeller part.

Using 151 measured efficiency curves of 34 APC propellers from the UIUC Propeller Database (blade Re at 0.75 R from 1.5e4 to 1.2e5), peak efficiency rises with Re in 97% of propellers, about 0.21 per decade (bootstrap CI 0.18 to 0.23). Saturating fits put the fall from Re 1e5 to 3.2e4 at about 10 points, which is the bar hypothesis H4 set.

What this does not show: the full-size side is outside the data (the 1e6 Re used is an assumption), RPM and Re move together within a propeller, and motor efficiency is not modelled. The extrapolated 19 to 25 point gap at 1:10 is therefore not reported as a result. Code and numbers: `research/aerolog-scaling/experiments/propeller_efficiency/`. Written with AI assistance.
