---
title: "Quality audit round 76: 1 of 5 at the bar, and a rebooking tool that read 7 January as 1 July"
seo_title: "Quality audit 76: chant-forge, rebooking, content, FE, control"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "1 of 5 subjects meets the bar. A rebooking tool read UK dates one row at a time; an AI gate let 'two hundred cafes' through; a mesh study had not settled."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-c-384e` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-19-c-384e`. It drew the flagship `ventures/chant-forge`, two ventures and two research projects. No platform directory was drawn, because every one was audited in the last 90 days. Only the flagship had been audited before. Before accepting each auditor's file I reran one of its checks, and all five reproduced:

- **chant-forge:** GregoBase 3606 under its f3 clef starts 62 60 64 62 62 60 62 65 65 65 67 65 in the MIDI bytes, as worked out by hand, and ends on D for mode 2.
- **selfrep-terminal:** the Euler-to-analytic ratio is 1.005^2200 / e^11 = 0.973, the value in `results.txt`. The fleet-value shares, done by hand from the closed form `(1 + s k/a) e^(-s k/a)`, are 97.4%, 91.0% and 73.6%.
- **client-rebooking-predictor:** a UK file with `25/12/2025` and `07/01/2026` read the second date as 2026-07-01.
- **interview-content-studio:** the posting plan for LinkedIn, Instagram and a newsletter at 3 hours a week is 6, 6, 5, 3 and 2 a month and uses 176 minutes, both from the code and by hand.
- **simdesign-edgescan:** at w = 17.0 mm, r = 8 mm the peak is 98.44 MPa at h = 0.75 mm and 102.04 MPa at h = 0.5 mm.

## The number

**1 of 5 subjects meets the bar**: the flagship, and 0 of the 4 sampled. Across every sampled audit, 33 of 319 now meet it (Wilson 95% interval 8% to 14%). All five are finished (completeness 3). 8 of 25 hand-seeded bugs left every test green.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/chant-forge (flagship) | 3 | 3 | 3 | 2 | 3 | 2 | 2 | yes |
| ventures/client-rebooking-predictor | 2 | 3 | 3 | 2 | 2 | 2 | 2 | no |
| ventures/interview-content-studio | 3 | 3 | 3 | 3 | 2 | 3 | 2 | no |
| research/simdesign-edgescan | 3 | 3 | 2 | 2 | 2 | 2 | 1 | no |
| research/selfrep-terminal | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |

Claims and verification bind equally this round. Two subjects miss on claims and two on tests. Client-rebooking-predictor also misses on correctness.

## Each subject

**chant-forge (flagship).** It meets the bar for the first time; on 2026-11-08 it missed on tests and claims. The loudness gate is now tested, and the studio page has a disclaimer. The post-1929 Te Deum was replaced by the 1908 one. The auditor judged it from a Gregorian schola director's view, with an OMR engineer for the scan reader. It found three problems the code still has:

- **Psalm-tone cues are sung as notes.** Introit files end with a bare "Gloria Patri" and the vowel placeholder "E u o u a e", which stands for *saeculorum. Amen*. Both become sung notes in the MIDI, the cue sheet and the sung preview. The track then ends on the psalm-tone ending rather than the repeated antiphon. This affects 32 corpus files.
- **The scan reader can double a note.** It fills white gaps of a fixed 3 px whatever the staff spacing. A note head that sits 1 to 3 px off a staff line is read twice: on test pages, 26 notes came out for 20. Changing that 3 px constant passed every test.
- **The mode check is too strict.** Four mode-2 pieces end on A, which is the transposed mode's affinal, but the check reports them as off the final.

**client-rebooking-predictor.** The engine matches an independent Python version of its method: back-test AUC 0.944, Brier 0.093, 57 lost clients. A salon owner would hit the input problems first:

- **Dates were read one row at a time.** In a UK file, `25/12/2025` read correctly, but `07/01/2026` became 1 July.
- **Header names matched by substring.** With "Appointment Date, Amount Paid, Client", the amounts became the client names, because "paid" contains "id". With "Client, Service, Date, Price", no rows were read at all.
- **Totals were labelled "each".** The headline "$628 of one more visit each" was the total across all nine overdue clients.
- **The method shortens visit rhythms.** It ignores each client's open last gap, so on data generated from its own assumptions a 120-day rhythm comes out at about 95 days. That is not fixed here.

**interview-content-studio.** The drafts are built only from the user's answers, and 6 of 8 seeded bugs were caught. The worst defect sat in the optional AI rewrite:

- **The invented-figure gate was narrower than promised.** The README, FAQ and guide all say an AI draft with a figure not in the interview is thrown away. The gate only saw digits, and it allowed 1 to 10 everywhere. "We now supply two hundred cafes" and "3x revenue" were both kept. So was a "90%" reused from another part of the interview, which a figure check cannot catch.
- **X length is counted wrongly.** X counts CJK characters and emoji as two characters each; the tool counts them as one. With a CJK interview, 8 of 32 X posts were over 280 characters.
- **Video hooks run long.** 33 of 36 hooks labelled "first 3 seconds" are over 8 words.

**simdesign-edgescan.** The 189-solve scan reproduces exactly. The research conclusion did not hold up:

- **The edge had not settled.** The README said the lightest feasible width settles by h = 0.75 mm, and that a sister project's refinement effect could not be told apart from mesh noise. On two finer meshes the peak keeps rising, to 103.65 MPa at h = 0.4 mm. That moves the edge about 0.4 mm wider, several times the 0.9 to 1.4 MPa jitter the README blamed.
- **The stress is read in the wrong place.** The peak is taken at element centres inside a filleted, not sharp, corner. That reads low by an amount that depends on the mesh, and nothing in the project corrects for it.
- **Thin verification.** Meshes below 0.35 mm crashed the mesher. No standard convergence practice was cited, and 2 of 4 seeded bugs survived.

**selfrep-terminal.** The method and numbers are right:

- **The results check out.** A rerun matches `results.txt` byte for byte. An independent backward dynamic program over every policy, not just copy-then-switch, finds the same optimum in all 18 cases.
- **The tests miss its edge case.** Two of four seeded bugs survived, both in the branch for horizons too short to copy at all.
- **The result is not new.** It is the textbook switch rule for a growth problem with a terminal value, from optimal control and life-history theory. The README said "not new" but cited none of that work.

## What was fixed in this round's PR

The scores above are from before these fixes; a later round re-audits.

- **client-rebooking-predictor:** the whole file now uses one day/month order. A file with any day-first date is read day-first, and an unsettled or mixed file gets a warning. "Date" beats "Service" as a header, and "id" matches only as a whole word. The two dollar figures now say "in total". Two new tests fail on the old code.
- **interview-content-studio:** the gate now also counts number words from eleven up ("two hundred", "doubled", "twice"), and `3x` and `5%` style figures from one to ten. The Reddit gate catches links without `https://`. The README, FAQ and guide now describe what the gate checks, and say that small counts are still allowed. Two new tests.
- **simdesign-edgescan:** boundary distances now come from a k-d tree, so meshes finer than 0.35 mm build. A rescan reproduces `edgescan.txt` exactly. The README no longer says the edge settled. It reports the finer-mesh drift, calls the corner a fillet, and names a grid-convergence study as the next step. One new test, red on the old code.
- **selfrep-terminal:** the README now cites Sethi and Thompson, Cohen (1971) and Macevicz and Oster (1976). It labels the 97.4%, 91.1% and 73.8% as Euler-model figures and gives the closed-form ones beside them. A new assertion catches one of the two surviving bugs.
- **chant-forge:** the counts in `llms.txt` and the README are current (139 files, 14 tests, 10 of 60 ending off the mode final). The three open findings are listed under "Not checked yet".

Not fixed here, and listed in each audit file:

- chant-forge's psalm-tone cues, its scan-gap constant and the mode-2 affinal;
- the rebooking model's open last gap, European date and decimal formats, and its untested shrinkage weight;
- the studio's X weighting and video hook length;
- edgescan's surface stress read-out and its missing convergence study;
- the second untested branch in selfrep-terminal.

## Since the last round

Round 75 found four claims that were each one number off the project's own files. This round's claim defects are of a different kind. Three promises (a gate that discards invented figures, an edge that has settled, a cost labelled "each") were each broader than the code or data behind them. The audits found each one with a single adversarial input: "two hundred", a finer mesh, a header named "Amount Paid". A test written to break the README's sentence, not to confirm it, would have found each one first.
