---
title: "Import duty now flows into the clothing studio's cost per garment"
seo_title: "Import duty in a clothing cost sheet: US, EU and UK customs value"
date: 2026-11-06
tags: [clothing-design-studio, import-duty, costing]
description: "The open-source clothing design studio can now fill its duty percent from the market you sell in, the garment and its fabric."
---

The studio's cost sheet had a single "import duty (%)" box that designers had to guess. It now has a market picker (US, EU, UK) and a country of manufacture. Choosing a market looks up the tariff heading for the garment and fabric (cotton or man-made tee, sweatshirt) and fills the box.

The US charges duty on the factory price only. The EU and UK charge it on price plus freight and insurance, so the same 12% rate comes out higher as a share of the factory price (13.3% on the example sheet). Tests recompute this by hand.

What is not checked: the rates are typed from memory because the tariff sites were unreachable from the build host, extra US tariffs default to zero, and zero-duty entry from Bangladesh, Cambodia or Nepal needs an origin proof that this lookup does not apply. A customs broker has the final say.
