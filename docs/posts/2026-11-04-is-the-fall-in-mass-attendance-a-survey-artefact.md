---
title: "Is the fall in Catholic Mass attendance just a web-survey artefact?"
seo_title: "Catholic Mass attendance, GSS 2022 and 2024: a survey mode effect?"
date: 2026-11-04
tags: [research, catholic-demography, survey-methods, GSS]
description: "The GSS randomised 2022 and 2024 respondents to face-to-face-first or web-first. Catholic weekly attendance differed by 2.2 points [-3, +8]."
---

Weekly Mass attendance among US Catholics in the General Social Survey fell from
24.0% (2010-18) to 17.7% (2022 and 2024). The surveys also moved from
face-to-face to mostly web, so how much of that is real?

The 2022 and 2024 GSS randomly assigned sample cases to a face-to-face-first
design or a mail-invitation-to-web-first design. That is a proper experiment,
and it is in the public file as `modesequence`.

Result: Catholics in the face-to-face-first arm reported weekly attendance of
19.4%, in the web-first arm 17.1%. The difference, +2.2 points, has a 95%
interval of -3.1 to +7.5. We can't see a mode effect, and we can't rule out
one of about five points either way. The face-to-face-first arm alone is still
4.6 points below 2010-18 [0.4, 8.9], roughly three quarters of the full fall.
Non-Catholics fell about as much, so it is not a Catholic-specific story.

Completed web interviews report much lower attendance (12.8% against 21.9% in
person), but people choose their mode, so that gap is who answers by web, not
how they answer.

This is milestone 3b of the open programme on Catholic demography: code, tables
and log in `research/catholic-demography`. Next: reproduce published retention
tables, then retention models by cohort, ethnicity and immigrant generation.
