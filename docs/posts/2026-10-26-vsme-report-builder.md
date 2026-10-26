---
title: "A free VSME report builder for small suppliers"
date: 2026-10-26
description: "A free browser tool that turns a small supplier's energy, emissions and workforce figures into a draft VSME Basic Module report, with gaps flagged."
tags: [vsme-report-builder, ventures, sustainability-reporting]
---

Large customers and banks that report under the EU's CSRD increasingly ask their small suppliers for sustainability data, and EFRAG's voluntary VSME standard (December 2024) is the format many point to. Its Basic Module has eleven disclosures, B1 to B11.

We built a browser tool for it: fill in energy, emissions, workforce, safety and pay figures in any order and get a draft report, a completeness check per disclosure, and flags where numbers contradict each other (men plus women not equal to staff, renewable energy above total). Blank stays "not reported", never zero, and it supplies no emission factors because a wrong one is worse than a blank.

What it is not: assured or checked against the standard's own text. That PDF could not be fetched from our build host, so the tool was written from secondary summaries and says so on the page. Next is a datapoint-by-datapoint check and a real supplier questionnaire.

Try it at https://duncan-haywood.github.io/oss-monorepo/vsme-report-builder/
