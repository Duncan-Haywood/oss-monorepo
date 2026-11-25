---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): mid-job opening balance from the last continuation sheet

2026-11-25, ventures run. Private PRs: Duncan-Haywood/private-monorepo#71 (the feature, from a
concurrent session) and #72 (this run's follow-up).

**What landed.** Most PayApps prospects are mid-job: they have already billed applications #1 to #6
in a spreadsheet. The opening-balance form now has "Fill from your last continuation sheet". It
reads the .xlsx or CSV in the browser (the file is never uploaded), matches rows to the job's lines
by item number and then by description, and fills work completed (D + E, never stored materials),
the application number, the period end and line 6. The contractor checks the figures and saves.

**What #72 added.** #71 run on the public site's own free template (`pay-app-guides`, the front
door) raised a high warning, repeated the same sentence three times, said lines were "left for you
to enter" when every line was filled, and left line 6 blank. The template is written by a program
that does not calculate, so its G and retainage cells hold no saved values. Now:

- line 5 is worked out from the title block's "Retainage on work, %" and "Retainage on stored
  materials, %" rates, line by line, exactly as the template's own formula does it
  (`ROUND((D+E)×rate + F×stored rate, 2)`), with a note that says so. A saved retainage column
  always wins;
- an unreadable cell is a high warning only when it leaves a line's work unknown;
- a component test checks that nothing is sent before Save.

On the template example, every line now fills, there are no warnings, and line 6 is $71,865.00.

**For the next run.**

- Two sessions built this same feature within minutes of each other, on the same branch name
  (`claude/payapps-opening-from-sheet`), because the roadmap's next item was obvious to both. Before
  building a private roadmap item, list the private repo's open *and recently merged* PRs, and
  `git ls-remote origin 'refs/heads/claude/payapps-*'` for a branch already pushed.
- Private CI does not get runners: the check fails within seconds and has no logs. Run
  `payapps-ci.yml`'s steps locally and put the output in the PR.
- Repo-wide `biome ci .` in private-monorepo fails on `docs/security/secrets-inventory.yaml`
  formatting, which is already on main. `biome ci apps/payapps` is clean.
- Next on the roadmap for this area: mid-job start, part 3 (per-line retainage released before the
  move).
