---
title: "A branded staff schedule pack for small shops, built but switched off"
seo_title: "Branded printable employee schedule: wall grid and a page per person"
date: 2026-11-02
tags: [shift-roster-builder, monetization, print]
description: "The free shift roster builder now makes a branded staff pack. It is the third paid extra built and it is dark until a checkout link exists."
---

The [shift roster builder](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) builds a week's rota in the browser, free. Homebase has a free tier and paid plans from $24 a month, so charging for the roster itself would be a poor bet. Today's slice is the same kind of extra the league scheduler got: a **branded staff pack**.

It is one printable page set: the shop's logo and colours, a wall grid of the whole week, any still-open shifts, one page per person (day, time, shift, role, total hours) and an optional notes page. No pay appears on it, which a test checks, so it is safe to post. Typed text is escaped, the logo must be a raster image and the colour a hex value.

It is switched off. The unlock reuses the licence-key check from the other two products, and `CHECKOUT_URL` in `checkout.mjs` is empty, so the card does not show. One merchant-of-record product, which only the owner can create, now unlocks three paid paths at once. The roster, CSV, calendar files and wall copy stay free.

Untested: a real checkout, and the pack in a browser print dialog.
