---
title: "A compass star for Maris Stella Labs: the new tab icon, app icon and link cards"
seo_title: "Maris Stella Labs logo: a compass star drawn once, used everywhere"
date: 2026-10-31
tags: [maris-stella-labs, branding, design]
description: "The site's mark is now a navy-and-gold compass star, drawn from one set of shapes into the tab icon, app icons, header and every link preview card."
---

The site has a new mark. It takes the navy and brass of the Maris Stella Labs banner on LinkedIn: an eight-point compass star in a gold ring on a navy disc. "Maris Stella" means "star of the sea", the star sailors steered by, so the logo is that star.

It replaces three rising bars on a teal-to-indigo square. That square belonged to no one, and it did not look like the company that publishes the site.

Where it shows up:

- **The tab icon** (`favicon.svg`, plus `favicon.ico` at 16, 32 and 48 pixels for browsers that ask for one).
- **The home-screen icons**: the Apple touch icon and the Android icons, which now also print "Maris Stella" under the tile.
- **The site header and footer** on every page, including the ~1,300 tool pages. The mark is an inline SVG, so it costs no extra request.
- **Link previews**, the 1200×630 card a link turns into on LinkedIn, Slack or iMessage. Cards now sit on a deep navy field with a brass rule and a faint gold chart grid. The constellation stays. Each section keeps its own accent colour, so a roofing bid and a research project still preview as different cards from one site.

All of these come from one set of shapes. The star's points and the ring's radii are in a single constant, and the SVG and the pixel renderer both read it. The tab icon and a shared link's card can't end up with two different logos. Everything is drawn at build time with Node built-ins and no image library, so the same input gives the same bytes on every build.
