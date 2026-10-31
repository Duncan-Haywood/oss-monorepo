---
title: "Better batteries cannot flip a boat's hull ranking, and we checked"
seo_title: "Can battery energy density change which boat hull goes furthest?"
date: 2026-10-31
tags: [marine-hull, research, autonomous-boats]
description: "In a model of a 200 kg survey boat, 0 of 2,187 monohull-versus-catamaran cases swap rank across 150 to 250 Wh/kg packs; a 30 W hotel load sets best speed."
---

The marine-hull programme had two hypotheses it never ran as written. We ran them.

**Hotel load (H1).** Across 27 combinations of wetted-area constant, form factor and wave term, a 4 m, 200 kg monohull's best range spreads from 763 to 921 km (20.6%), so the "under 10%" claim is refuted. Each constant alone moves range by 9.0%, 8.1% and 0.8%. What does hold is that propulsion takes 0.33 to 0.37 of the power at the best speed (about 1 m/s), the one-third that drag growing with speed cubed gives in theory.

**Battery flip map (H5).** Over 2,187 hull-parameter cases, no monohull-versus-catamaran ranking changes between 150 and 250 Wh/kg. This is not a finding about hulls: range is proportional to pack energy, so the ratio cannot move. Making a better pack lighter shifts the ratio by at most 0.13%.

A flip needs something not proportional to pack energy, such as a fixed mission energy. The inputs are swept, not measured, and two hull types are compared. Log: `research/marine-hull/LOG.md`, milestone 7c.
