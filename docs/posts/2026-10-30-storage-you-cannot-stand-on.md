---
title: "Storage you can't load: why the shed gallery turned to lean-tos"
date: 2026-10-30
tags: [shed-designer, search, storage]
description: "The shed search counted the space over bare rafter ties as storage. Counting only open or decked roof space moved 8 of 11 gallery picks to lean-tos."
---

The [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) has a design search that ranks sheds on cost, storage and looks. Its storage figure is cubic feet inside: the box up to the top of the walls, plus the space under the roof.

Until today, "the space under the roof" meant the whole triangle, even on a gable framed with rafter ties. Rafter ties are 2x4s 16" or 24" apart, and they hold the walls together. They are not a floor, and you cannot set a box on them without decking them first. The tool's own note said so ("deck the ties before loading it"). The search counted the space anyway.

**The new rule.** Today the tool gained a second measure, *usable* storage (added by the gambrel work, `usableCuFt`), and the gallery now searches and ranks on it. Roof space counts only where you can use it:

- **Open to the roof:** all of it. That covers a ridge beam, which needs no ties, and a lean-to's single slope.
- **Over a deck:** the space between the deck and the rafters, measured over the deck's own footprint. A truss attic with "attic storage" ticked has a deck; it is decked on the chords and sized for 20 psf. So does a gambrel's half or full loft.
- **Over bare ties or chords:** none.

The search can buy decked storage two ways: attic storage on trusses (new in this change), and a gambrel's loft. Each is tried only where it means something.

**What moved.** On the default 8x12 switched from its ridge beam to a ridge board, the roof triangle is 52 cu ft. It counts toward the shed's volume but not toward its usable storage, which is 596 cu ft rather than 649. A 12" attic deck on trusses at the default's low pitch adds back only 12 cu ft. At steeper pitches the deck adds more, but it costs plywood and heavier chords.

Then we regenerated the gallery. **8 of its 11 picks are now lean-tos.**

- "Most room per dollar" is an 8x12 lean-to at $2,886 for 790 cu ft.
- "Most storage" is a 10x10 lean-to holding 819 cu ft, 139 cu ft of it under the open slope.
- The barn card took a full loft, and 144 cu ft of its roof space is over the deck.
- The cheapest cards stayed ridge-board gables. They are the cheapest builds, and they never claimed the roof space.

**Why it matters.** The owner's brief for this tool asks for maximum storage at minimum cost. A search that counts space you can't load will recommend roofs whose storage is mostly a promise. A lean-to puts everything under one open slope, so the space is really there. Its tall front wall also takes doors and windows, and the back can stand against a fence.

A gable with a ridge beam is open too, but the beam and its posts cost more. Decking a ridge-board gable's ties (2x6 ties at 16", sized as floor joists for a light storage load) would be another way to get usable roof space. It needs its own structural check, so the tool does not offer it yet.

As always: these are estimates from dated store prices, and the designs are not engineered or code-checked.
