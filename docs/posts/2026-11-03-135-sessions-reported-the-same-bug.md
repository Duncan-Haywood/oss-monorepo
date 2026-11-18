---
title: "135 agent sessions reported the same bug: ranking friction instead of counting it"
seo_title: "135 agent runs reported one bug: ranking agent friction"
date: 2026-11-03
tags: [process, agents, measurement, automation]
description: "Grouped by problem, 135 agent sessions in a week reported one missing branch. Also: stale doc counts, weekly reproducibility, and flagship usage."
---

Every agent run in this repository ends with a run record, and each record lists the "doc friction" it hit: an instruction that was wrong, stale or easy to misread. There are 4,676 records. Until today nothing grouped them by problem. A tool only totalled them per file, so nobody could see that most of the reports were the same complaint.

`platform/ci/friction_rank.py` now groups each file's reports by word overlap and ranks the groups by how many distinct sessions reported them. The top line for the last seven days:

- **135 sessions** hit the same instruction. Step 0 of the master prompt fetches a `security-alerts` branch, and that branch only exists when there is an alert. The fix is one sentence. But the file is owner-gated, so each session that noticed opened its own pull request with that sentence. Sixteen of those were open at once. We kept one ([PR 12885](https://github.com/duncan-haywood/oss-monorepo/pull/12885)), moved the other sessions' run records into a single PR so no data was lost, and closed the rest.
- After that come a flagship whose next steps all need data the cloud proxy blocks (26 sessions), and a long tail of setup notes in the research guide (pyenv, torch wheels) that keep going stale.

Three more routine measurements moved from agents into software in the same change:

- **Stale numbers in docs.** Reports kept quoting counts that were wrong within days. The worst: "16 ventures lack llms.txt" when 5 did. A doc can now wrap a number in a marker naming a registered count, and `check_doc_counts.py` re-computes it. Its first catch: the product playbook said the code ships in 1,236 ventures when there are 1,331.
- **Do research results still reproduce?** A one-off audit in October re-ran 92 projects and found no changed numbers. A one-off can't see drift, though: on 1 November a Yosys upgrade changed an output format and broke a chip-design experiment. `repro_watch.py` re-runs a different seeded sample every ISO week, plus recently changed projects, and fails only when a project finishes with different numbers. A first local sample of 7 gave 4 identical runs and 3 missing tools, with no differences.
- **Usage against the flagship list.** The weekly engagement report counts page loads but never says which pages are flagships. Joining the two shows that in the 14 days to 3 November, **none of the 11 flagships got a single human page load**. Shed-designer, which is not a flagship, got 20. The counts are tiny and cookieless, so this is a reason to look at the list, not to reorder it. Until now no run could have cited the number at all.

A weekly report-only workflow will run all of it (owner approval pending, because it lives in `.github/`). The point is the repository's rule of thumb: chores that software can do at 90 to 100% of the quality go to software, so agent runs spend their time on the fixes.
