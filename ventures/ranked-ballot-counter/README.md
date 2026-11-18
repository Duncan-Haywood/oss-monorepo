# Ranked-Choice Ballot Counter

How do you count a ranked-choice vote from a Google Form or a spreadsheet,
and show the members how the winner was reached? Paste the ballots (or open
the CSV) and this free browser tool and zero-dependency CLI gives:

- the **instant-runoff (IRV) winner**, round by round, with each elimination
  and the exhausted ballots;
- a **single transferable vote (STV) count** for several seats: Droop quota,
  weighted inclusive Gregory surplus transfers, every stage shown;
- the **Schulze ranking**, whether a candidate beats every other head to head
  (the Condorcet winner), and the full head-to-head table;
- the candidate with the most first choices, for comparison;
- warnings for blank ballots, repeated candidates, skipped ranks and equal
  rankings, and for any tie that had to be drawn by lot;
- a CSV of every round.

Live: https://marisstella.app/ranked-ballot-counter/ . Guide:
[why instant runoff and Condorcet can pick different winners](instant-runoff-vs-condorcet-four-city-example.html).

For clubs, associations, co-ops, boards, unions, student bodies and polls.
**Not for public elections**: it is not certified election software and
does not implement any jurisdiction's statute word for word.

## Input

Three layouts, detected automatically:

| Layout | Example |
|---|---|
| Preference lines | `Ana > Ben > Cy`, `12: Cy > Ana` (12 identical ballots), `Ana = Ben > Cy` (equal ranking) |
| One row per ballot | `Ana,Ben,Cy`, or columns headed `Rank 1`, `Rank 2` / `Choice [1st]` (read in rank order; other columns ignored) |
| Grid (Google Forms multiple choice grid) | header `Vote [Ana],Vote [Ben]`, cells `1st choice` / `2` (equal numbers are a tie, blanks unranked) |

Names match case-insensitively. Columns named `Timestamp`, `Email address`,
`ID` and similar are never read as candidates.

## Counting rules

- **IRV:** a ballot counts for its highest-ranked continuing candidate. While
  nobody has more than half of the ballots still in play, the last-placed
  candidate is eliminated. A ballot whose next live rank is shared by two
  continuing candidates is exhausted (the usual overvote rule), and an
  exhausted ballot stays exhausted.
- **STV:** quota floor(valid / (seats + 1)) + 1 (Droop 1881). Anyone at or
  over quota is elected; the largest surplus moves first, every paper the
  candidate holds passing on at value surplus / total, truncated to 5
  decimal places (the residue is reported as "lost to rounding"). With no
  surplus pending, the lowest hopeful is excluded and their papers move on
  at their current value. When hopefuls equal seats left, all are elected.
  The 5-decimal precision and the tie rule are this tool's choices.
- **Schulze** (Schulze 2011): winning-votes link strengths, strongest paths
  by widest-path Floyd-Warshall, ranking by how many candidates each beats.
  An unranked candidate is below every ranked one on that ballot.
- **Ties** for elimination or for the largest surplus: the most recent
  earlier round in which the tied candidates' votes differed decides; if
  none, a lot is drawn from a seeded generator (`--seed`, default 1), so the
  same seed always reproduces the count. Your rules may name another
  tie-break; follow them.

## Use

Browser: open `index.html` (served over http, as it loads ES modules).

CLI:

```
node cli.mjs ballots.csv                 # IRV, 1-seat STV, Schulze, every round
node cli.mjs ballots.txt --seats 3       # 3-seat STV
cat ballots.csv | node cli.mjs - --json  # machine-readable result
node cli.mjs ballots.csv --csv > rounds.csv
```

Engine: `ballots.mjs` exports `analyze({ ballots, seats, seed })`,
`parseBallots`, `irv`, `stv`, `schulze`, `pairwise`, `reportCsv` and
`PAPERS`.

## Verification

Run here on 2026-11-14 (`node --test *.test.mjs`, 36 tests):

- **Worked examples with answers that do not come from this engine.** The
  four-city profile (Wikipedia, "Instant-runoff voting" and "Condorcet
  method"): IRV elects Knoxville after eliminating Chattanooga then
  Nashville, Nashville is the Condorcet winner, Memphis has most first
  choices. Schulze's 45-voter example (Wikipedia, "Schulze method"): ranking
  E > A > C > B > D, with pairwise counts and strongest paths recomputed by
  a separate Python count. A 20-ballot, 3-seat STV election counted by hand
  in the test's comments.
- **Properties on random elections** (300 in the suite; 5,000 run once on
  2026-11-14): every IRV round and STV stage conserves the ballots (votes +
  exhausted + rounding residue = total), STV fills exactly the seats, IRV and
  one-seat STV elect the same candidate whenever no lot is drawn, and
  Schulze elects the Condorcet winner whenever one exists.
- **Independent recount.** `crosscheck/check.py` is a separately written
  Python IRV and Schulze. On 3,000 random elections from
  `crosscheck/gen.mjs` it agreed on all 1,909 IRV winners that needed no
  tie-break and all 3,000 full Schulze rankings
  (`node crosscheck/gen.mjs > /tmp/c.json && python3 crosscheck/check.py /tmp/c.json`).
  The first run found a real parsing bug (a file where most voters rank one
  candidate was read as CSV), fixed before merge.
- The page was run in Chromium at 390 px wide: example and a Google Forms
  grid with an ID column count with no console errors and no horizontal
  scroll.

Not verified: STV against another STV program (none was available offline
here); multi-seat results should be checked against your rules' own
software when it matters.

## Sources

- M. Schulze, "A new monotonic, clone-independent, reversal symmetric, and
  Condorcet-consistent single-winner election method", *Social Choice and
  Welfare* 36(2), 267-303, 2011. doi:10.1007/s00355-010-0475-4
- H. R. Droop, "On methods of electing representatives", *Journal of the
  Statistical Society of London* 44(2), 141-202, 1881. doi:10.2307/2339223
- Example profiles: Wikipedia, "Instant-runoff voting", "Condorcet method"
  and "Schulze method" (CC BY-SA; the ballot counts are facts of the
  example, restated here).

Implemented from the methods' published descriptions; no other program's
code is used. Built with AI assistance.

## Privacy, usage counting, licence

Everything runs in the browser; nothing is uploaded and there are no
accounts, cookies or analytics vendors. Anonymous feature counters
(`ballots_counted`, `example_loaded`, `file_opened`, `report_downloaded`)
live only in the visitor's local storage, honour Do Not Track and Global
Privacy Control, and have an off switch on the page.

**No warranty.** Provided as-is, without warranty of any kind. Not legal or
professional advice and not certified election software; your
organisation's rules decide the method, the tie rule and who certifies a
result.

MIT licence (`LICENSE`). Optional support:
https://github.com/sponsors/Duncan-Haywood
