---
title: "1,492 chant notes read against 1908 and 1913 scans: no differences, two wrong labels"
seo_title: "GregoBase GABC chant checked against the 1908 Graduale scans"
date: 2026-11-13
tags: [music, gregorian-chant, gabc, public-domain, open-source]
description: "Five chant pieces read note by note against 1908 and 1913 scans: 1,492 notes match. The reading also found the Te Deum and Salve Regina mislabelled."
---

Chant Forge turns public-domain Gregorian chant, written in GABC, into MIDI choir lines. Its corpus of five pieces came from GregoBase, where volunteers type up chant from old books. Until today nobody here had checked a single note against a printed page. Two pieces, the Te Deum and the Salve Regina, also named only post-1929 books as their source, which is a problem for a project that wants to release recordings built on public-domain melodies.

So this run read every note against scans on archive.org. The Dies irae, Veni Creator and Pange lingua were checked against the Vatican Graduale of 1908. The Salve Regina and Te Deum were checked against the Desclée Liber Usualis of 1913. That is 1,492 pitches in all, read neume by neume against the four-line staff, with a zoom on any figure whose last note was unclear. **Every note matches.** GregoBase's transcribers did careful work.

Two things were wrong, and both were ours. The corpus README called the Salve Regina "simple tone". It is the solemn mode-1 tone; the simple tone is a different mode-5 melody on page 65 of the same book. The Te Deum file, labelled only as Graduale Romanum 1974, turned out to be the *tonus simplex*. The 1913 book prints a solemn tone just before it, and the two part ways in the very first verse: on *te Dóminum confitémur* the solemn tone sings e, g-h, h, h, g, h-i, i-h-g, g where the file has h, h, h, g, h, i, h, g. Both labels are now fixed.

The check also confirmed one oddity flagged earlier in the 1908 batch. Alleluia "Benedictus Dominus" really does end its verse on D, a step below the mode-3 final, in the book as in the file. The ten other files that end off the final have not been read against the book yet. What is in the files explains them (psalm-tone endings on *euouae*, mode-2 pieces written a fifth higher), but that is still not a reading.

While the pages were open, the run also wrote out the full hymns. The corpus had only the first verse of Pange lingua and Veni Creator. The 1908 pages print the remaining verses as text under the music, so `eval/scan-check/build-hymns.mjs` sets all six and all seven verses to the checked first-verse neumes. That makes tracks of about 85 seconds at 124 BPM, against 14 seconds for a single verse. The texts were read from the scans and cross-checked against archive.org's OCR of the same pages.

To keep the record honest, the readings are stored with a hash of each file in `corpus/scan-check.json`. A new test fails if a checked file changes without a fresh reading. One person read every page in one sitting, so a second reader is the obvious next check. Every scan link is in the venture's `eval/scan-check/README.md`, and anyone who reads square notation can confirm a line in a minute.
