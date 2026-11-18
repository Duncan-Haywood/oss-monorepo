---
title: "A free allergen matrix and Natasha's Law label maker for small food businesses"
seo_title: "Free allergen matrix and PPDS label maker (14 UK/EU allergens, US 9)"
date: 2026-11-07
tags: [allergen-label-maker, food, small-business]
description: "Paste ingredient lists, get the 14 UK/EU allergens (or the US 9) per dish and print-ready pre-packed labels with allergens in bold. Browser only, MIT licensed."
---

Since 1 October 2021 a food business in England that packs food on its own premises for direct sale needs a label with the full ingredients and the 14 allergens emphasised. Small cafes and bakeries mostly do this by hand in a spreadsheet. We added a free tool for it: `ventures/allergen-label-maker/`.

You paste each dish's ingredients. It returns a matrix (UK/EU 14 or US 9) and a label per dish with allergens in bold. Three design choices matter more than the word list:

- **Look-alikes are removed first.** Coconut milk, cocoa butter, butternut squash, rice flour and eggplant do not trigger milk, nuts, gluten or egg.
- **A guess is not a declaration.** Hummus, Worcestershire sauce, pasta and dried apricots usually hide sesame, fish, gluten and sulphites. They show as "check" and are never bolded or listed under "Contains" until you confirm them with a supplier tag such as `pesto [milk, tree nuts]`.
- **The US list is not the UK list.** Rye and barley are not wheat, and molluscs, celery, mustard and lupin are not US major allergens.

What is not checked: the word list comes from the law's allergen names and has not been reviewed by a food-safety professional, and the page says every label must be confirmed against supplier information. There are 19 engine tests and 5 page tests, and the page ran clean in headless Chromium. It is a drafting aid, not legal advice. Source and README: `ventures/allergen-label-maker/`.
