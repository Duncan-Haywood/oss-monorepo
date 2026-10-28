---
title: "Naming the fields on a free e-invoice builder"
date: 2026-10-28
description: "An accessibility sweep of ten flagship products found twelve unnamed form fields and one mislabelled button; here is what was wrong and what changed."
tags: [accessibility, einvoice-preflight, site]
---

A screen reader reads a form field by its name. Twelve fields in the line-item table of the
e-invoice builder had none: a description box, the quantity, price, VAT and exemption-reason inputs, and the unit
and VAT-category dropdowns. To someone using one, they were "edit text, edit text, combo box".

An automated WCAG check (axe, run over the ten flagship products and the Stories page, 126 pages
at desktop and phone width) found them, plus a floating "Speak or type" button whose spoken label
did not begin with the words printed on it, which breaks voice-control users who say what they see.

Each field now carries its column heading as its name, and the button's label starts with its
visible text. The check that found them is `platform/pages/contrast.mjs`; give it slugs to run on
a slice rather than all 5,000 pages.
