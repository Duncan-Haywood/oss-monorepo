---
title: "Let the barn into the design search and it takes six of ten cards"
date: 2026-10-30
tags: [shed-designer, design-search, gambrel]
description: "Under a 100 sq ft and 13 ft limit, a gambrel shed won six of the ten ready-made design cards when the search could pick it, so it now gets a card of its own."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) opens with a strip of ready-made designs. Each one comes from a design search over size, roof shape, framing, siding, doors and windows, and each must pass every structural check, stay under 100 sq ft and keep its peak under 13 ft. Today the search learned the gambrel (barn) roof.

**What happened when it could choose one.** We let gambrels into both of the gallery's searches: one with every finish free to change, one held to painted lap siding and shingles. Barns then took six of the ten cards:
- the most room per dollar;
- the balanced pick;
- both cards that match a lap-sided house;
- the long shed;
- the mower shed.

Gables kept the cheapest card and the 10x10 square, and lean-tos kept the most-storage and best-looking cards.

**Why a barn is cheap for its room.** In this tool it has:
- no eave overhang, so no sub-fascia, fascia or soffit;
- chords short enough to come out of 8 ft boards;
- trusses of 2x4 at 16", whose chords check at about 10% of their capacity (the knee gusset nails govern at 26%).

Its steep lower slopes put the volume above the walls where a gable's triangle has little.

**Why it gets its own card instead.** A strip of eight barns is not a choice. So the other cards search gables and lean-tos, and a new "Barn for storage" card searches gambrels on their own. It is a 7x14 in painted fiber cement lap siding and shingles: $3,168 in materials at the starting Home Depot prices, 806 cu ft inside, a 12 ft peak. That is 255 cu ft per $1,000. The gable cards in the same lap-and-shingle finish run 202 to 251 cu ft per $1,000.

**A caveat on looks.** The looks score is a heuristic and says so. It gives full marks for an overhang of 8" to 12". A barn has none, so it gets half marks there, and a 4/12 to 8/12 upper slope counts as the classic barn outline. Change those rules and the count of six will move. The finding that a barn is cheap for its room does not depend on them.

The search code is `designsearch.mjs` and the cards are in `gallery.mjs`. Prices are listings seen on 2026-10-29 and are editable in the tool. This is a screening tool, not engineering.
