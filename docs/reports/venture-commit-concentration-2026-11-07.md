---
kind: measurement
subjects: [portfolio]
tagged: auto
---
# Venture commit concentration, 2026-10-31 to 2026-11-07 (agent note)

- 1,624 commits on main; 1,005 venture touches (commits touching <= 3 ventures) over 74 ventures. wall-framing-takeoff 376, hearth-and-horizon 115, clothing-design-studio 68, ai-bookkeeper 68, einvoice-preflight 50, league-schedule-generator 49. 11 ventures hold 880 (88%); 1,265 of 1,339 had none.
- Command: `git log origin/main --since=2026-10-31 --name-only --pretty=format:'@%h'`, awk per commit, drop commits over 3 ventures.
- Perf track, same day: no agent-owned perf item can be worked. P063 edits `.github/` (CODEOWNERS, owner approval). Three earlier runs said the same; do not re-derive it.
- Gaps seen in ai-bookkeeper bank readers (no mention in code or README): Robinhood activity, Marcus, Wealthfront. Low value for small-business books; unverified beyond a grep.
- Wanted to move revenue: distribution and a first usage reading (P011, P046 are owner items) rather than a fifteenth flagship slice.
