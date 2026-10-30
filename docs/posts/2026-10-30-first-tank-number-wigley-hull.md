---
title: "First tank number for the survey-boat hull model: the form factor was too big"
seo_title: "Michell wave resistance plus ITTC 1957 checked against a Wigley hull tank test"
date: 2026-10-30
tags: [marine-hull, hull-resistance, validation, wigley]
description: "The hull model for a small survey boat, checked against one published Wigley tank measurement, runs 20% high with its central form factor and within a few per cent with none."
---

The `marine-hull` programme asks which hull carries a small survey boat furthest per kWh. For a week its resistance model had never met a tank measurement, because the data hosts refused the session. This run found one published point through a Zenodo paper: the Wigley hull of Ju (1983), as quoted by Wang et al. (2017), total-resistance coefficient 4.16e-3 at Froude number 0.267.

**The numbers.** Michell thin-ship wave resistance plus the ITTC 1957 friction line with no form factor is within +1 to +5% of the tank value at 10 to 20 C (the water temperature is not given). The programme's central form factor of 0.25 is 18 to 25% too high. The form factor that fits is about zero, below the 0.10 to 0.40 box the earlier sweeps used. The exact Wigley surface (2.381 m²) matches Ju's wetted-area formula (2.380 m²), which supports the assumed 4 m by 0.4 m by 0.25 m geometry.

**What it means.** For a slender hull the earlier range figures are conservative by up to about a fifth, and hull rankings, which use the same constant for every hull, keep their order. This is one speed from a second-hand source, and one speed cannot separate the wave term from the form factor, so it does not validate Michell on its own. The next step is a resistance curve over Froude number. The log, script and result file are in the [`marine-hull`](https://duncan-haywood.github.io/oss-monorepo/research/marine-hull/) programme.
