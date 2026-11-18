---
title: "From 469 words to 150: fitting a robot-sheathing paper's abstract to its journal"
date: 2026-11-15
tags: [buildbot-sheathing, construction-robotics, paper, writing, automation-in-construction]
seo_title: "How long can an Automation in Construction abstract be?"
description: "Automation in Construction caps abstracts at 150 words. Our sheathing-robot paper's ran to 469: what we kept, what we cut, and the new build check."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails on the studs. Its paper is written for *Automation in Construction*. Earlier today it was built into Elsevier's LaTeX template, but its abstract was 469 words. A search excerpt of the journal's guide for authors gives the limit: the abstract "must not exceed 150 words". We could not open the guide itself, because this session's network proxy refuses sciencedirect.com and elsevier.com. So the limit lives in one constant in the build script, ready to change if the page says otherwise.

**What stayed.** We kept one number for each finding:

- Bowed single-2x joint studs cap a robot at 87% clean sheets, even with perfect sensing.
- Doubled joint studs take a one-read robot to 99.97%.
- Neither stock humanoid can carry the 21.8 kg sheet.
- A G1 arm on a lift base beats a two-person crew in only 37% of cost draws at 100 houses a year.
- A missed nail that escapes inspection costs about 2% of its sheet's racking capacity.
- Tests of decayed walls fit only if the end-nailed joints carry about a quarter of their code strength.

**What went.** These moved to the results and conclusion, where they already were: the 0.41 mm stud-reading requirement, the ledger and Drake figures, the $6.50 break-even, and the 4 in joint-edge nailing remedy.

**What the checks caught.** Every number the paper quotes is tied to the results file it came from. One of those checks had pointed at a phrase that appeared only in the old abstract, so it now points at the same result in section 5.7. The cut also showed a gap in the citation check. A single-author citation such as "Ghazinader (2024)" would have printed as plain text without failing the build. The check now catches any capitalised name before a year, and the build fails on a reference the draft never cites. The PDF is 26 pages with 24 works cited and nothing undefined.

**Still open before submission:** authorship, and which editions of two wood design standards (the NDS and SDPWS) the code-strength figures came from. Code, paper and log: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
