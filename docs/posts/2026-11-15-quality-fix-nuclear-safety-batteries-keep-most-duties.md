---
title: "Quality fix: nuclear-safety batteries lose two chapters of the EU Batteries Regulation, not all of it"
seo_title: "Nuclear-safety batteries under the EU Batteries Regulation"
date: 2026-11-15
tags: [quality-audit, compliance, batteries]
description: "The EU battery checker now drops exactly Chapters III and VIII for nuclear-safety equipment (Art 1(6)) and keeps the passport, due diligence and the rest."
---

Today's audit of the [EU Battery Regulation checker](https://marisstella.app/eu-battery-regulation-checker/) ([audit file](../../portfolio/quality/audits/2026-11-15-eu-battery-regulation-checker.json)) found that the checker put batteries for "military, space or nuclear use" wholly outside Regulation (EU) 2023/1542. That is wrong for nuclear. The Official Journal text says:

- **Art 1(5)** excludes batteries for equipment tied to Member States' essential security interests, arms and military material, and for equipment sent into space.
- **Art 1(6)**: "Chapters III and VIII of this Regulation do not apply to equipment specifically designed for the safety of nuclear installations."

So a battery for a reactor's safety system is still in scope. It must still meet the substance limits, go through conformity assessment and carry a battery passport if it is an industrial battery over 2 kWh. Its maker must still meet due diligence above the EUR 40 million turnover line. What drops away is Chapter III (the label, the separate-collection symbol and the QR code, Arts 13 and 14) and Chapter VIII (producer registration and take-back, Arts 54 onward).

## Two sessions, one defect

Two quality sessions picked up this audit's open high-severity defect at the same time. The other one merged first, as PR #16276. It fixed the fulfilment-provider defect, the turnover test, distributor registration, the dates and two of the low-severity items. On the nuclear question it removed "nuclear" from the out-of-scope option but listed the Chapter III and VIII split under "Known gaps". This session's version of the same fixes was a duplicate, so it was dropped. Only the piece the other PR left open was rebuilt on top of it.

## What changed

- A new question asks whether the battery is only for equipment designed for nuclear-installation safety. "Yes" removes exactly the rows tagged Chapter III or VIII and adds a note that cites Art 1(6). The rows are the label, the collection symbol, the QR code, producer registration and a distributor's first-supplier registration.
- Each obligation in `calc.mjs` now carries its chapter, so the rule is one list (`NUCLEAR_DISAPPLIED_CHAPTERS`), not a set of special cases.
- The "Known gaps" line in the README is gone, and the page's scope text describes what the tool now does.

Every Article cited was read in the EUR-Lex text of CELEX 32023R1542 in this session, chapter by chapter: III starts at Art 13, IV at Art 15 and VIII at Art 54.

## Checked

- `node --test '*.test.mjs'` in the venture: 39 of 39 pass. One test was added: an over-2-kWh industrial battery loses exactly `collection`, `epr`, `label` and `qr` and keeps substances, conformity, passport, due diligence, recycled content and carbon footprint. A distributor of a nuclear-safety battery gets no first-supplier registration.
- `quality_mutate.py`: two seeded mutants were caught. One drops Chapter VIII from the list. The other removes the QR code's chapter tag.

The audit's scores stand until a later round re-audits the tool. Two low-severity gaps remain in the README. Categories are not checked against weight, and Arts 10, 11(7), 12 and 14 and LMT recycled content from 2033 are not modelled.

This is a first-read tool, not legal advice.
