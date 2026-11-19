---
title: "The Ask page on a phone: tables that clipped, and an empty box with nothing to try"
seo_title: "Making a privacy table readable on a phone: stacked cards"
date: 2026-11-19
tags: [site-design, polish, assistant, mobile, accessibility]
description: "/ask/ is the second most-loaded page on the site. At 390 px its two tables squeezed to one word per line and its panel opened empty. Both are fixed."
---

The site's own counter puts `/ask/` second among the pages people open: 20 of 115 human loads in its first nine recorded days ([the traffic post](2026-11-07-115-visitors-57000-bots.md)). It is the page that explains the assistant on every tool, and it is where the site says plainly where your words go. On a phone, that explanation was the hardest part of the page to read.

**What looked weak, at 390 px.**

- **The two tables.** One has four columns (engine, what it downloads, where your words go, what it is good at). The other has five (one per blind test round). Squeezed into 390 px, the narrowest cells were 54 px wide. "Blind round" ran one word per line for 18 lines, and the right-hand columns were cut off at the edge until you found the sideways scroll. The column that answers the privacy question, *what you type or say goes to*, was the one partly hidden.
- **No space after either table.** The next paragraph sat against the table's bottom border.
- **An empty panel.** The chat box opens with one greeting and about 180 px of blank space (266 px on a laptop), with nothing to try.

**What changed.** On screens up to 600 px wide, each table row is a card. The first cell is the card's title. Every other cell gets its column name as a small label on the left (`data-label` plus `td::before`). The header row is still there for screen readers, and explicit ARIA table roles keep the structure that `display:block` removes in Safari. Desktop is unchanged. Each table now has 18 px of space below it. The panel shows three example questions under its greeting. One tap asks the question, and the row goes away once anything is asked. All three were tried on the built site with the default engine, which runs no model. Two find tools through the site search, and one quotes the page's own answer on privacy. One candidate, "eBay fees on a $40 sale", was dropped because it answered first with a line from the test-round table.

**Measured** (Chromium, the built page, before and after):

| at 390 px | before | after |
|---|---|---|
| narrowest table cell | 54 px | 328 px |
| tables that scroll sideways | 2 of 2 | 0 of 2 |
| space between a table and the next paragraph | 0 px | 18 px |
| blank space in the panel | 183 px | 53 px |
| whole page height | 10,253 px | 10,172 px |

The engine table is taller as cards (1,083 → 1,185 px), and the blind-round table is shorter (711 → 493 px). At 320 px the page is 153 px longer, because every row is now readable instead of scrolling sideways. Nothing changed at 1,280 px apart from the spacing and the example row. The page still works without JavaScript: the tables are plain HTML, and the panel and its examples appear only when scripts run.

Before and after: [panel](../reports/img/polish-2026-11-19-ask-page-before-panel-390.jpg) → [panel](../reports/img/polish-2026-11-19-ask-page-after-panel-390.jpg); [table](../reports/img/polish-2026-11-19-ask-page-before-table-390.jpg) → [table](../reports/img/polish-2026-11-19-ask-page-after-table-390.jpg). The code is in `platform/pages/assistant.mjs` and `platform/pages/assistant/client.js`.
