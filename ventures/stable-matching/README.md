# Stable matching tool: Gale-Shapley deferred acceptance and every stable matching

**Live:** https://marisstella.app/stable-matching/

Two sides rank each other (residents and hospitals, students and schools,
mentees and mentors, volunteers and shifts, reviewers and papers), and you
need a matching that holds: no applicant and place who would both rather
have each other. This tool answers, on your lists, in the browser:

- **Who goes where?** Deferred acceptance (Gale & Shapley 1962) with
  capacities on the second side, either side proposing.
- **Is there more than one stable answer, and how do they differ?** Every
  stable matching is listed (McVitie & Wilson 1971), plotted by how well
  each side does, with the egalitarian (Irving, Leather & Gusfield 1987),
  minimum-regret (Gusfield 1987) and balanced picks.
- **Is the matching I made by hand stable?** Paste it; every blocking pair
  is listed with the reason.
- **Why is this person left out, or this programme short?** By the rural
  hospitals theorem (Roth 1986) the same people are left out in every
  stable matching; the tool checks and says so.
- **Which side should propose?** The proposing side gets its best stable
  outcome and is the only side that can never gain by ranking dishonestly
  (Roth 1982; Dubins & Freedman 1981).

Nothing is uploaded. Arithmetic on the lists you give, not legal or
professional advice: a real admissions, hiring or placement process has
rules of its own.

## Methods

| Method | Paper | What it does |
| --- | --- | --- |
| Deferred acceptance | Gale & Shapley 1962 | Proposers ask down their lists; receivers hold their best offers up to capacity. Applicant- or programme-proposing. |
| Every stable matching | McVitie & Wilson 1971; Gusfield & Irving 1989 | Break-marriage search on the seat-expanded instance, applicant-optimal first; stops at a limit (5,000) and says so |
| Egalitarian, minimum regret, balanced | Irving, Leather & Gusfield 1987; Gusfield 1987 | Smallest total rank, smallest worst rank, closest side totals, picked from the full listing |
| Rural hospitals check | Roth 1984, 1986 | Same applicants matched and same fill per programme in every stable matching |
| Blocking pairs | Gale & Shapley 1962 | For a matching you supply: unacceptable placements, over-full programmes, and every pair that would rather be together |

Each paper's DOI was checked against Crossref on 2026-11-17. The engine's
`PAPERS` constant lists what was implemented from each and every deviation.

## Input

```
[residents]
ana: city > mercy > general
ben: city > general
[programmes]
city (2): ben > ana
mercy: ana
general: ben
```

Two sections, each opened by a `[header]` that names the side. One line per
member, best first; `>` or `,` between names; `city (2)` or `city*2` for a
capacity, on the second side only. A pair can match only if each lists the
other; a one-sided listing is dropped with a note.

## Use it

- **Browser:** the live page, or open `index.html` from a checkout (served
  over http, since it loads ES modules).
- **CLI:** `node cli.mjs prefs.txt [--proposer A|B] [--check mine.txt] [--csv|--json]`;
  `--help` for the rest.
- **Agents:** `node platform/agents/tools.mjs call stable-matching analyze --input '{"text":"[a]\nx: P > Q\ny: P\n[b]\nP: y > x\nQ: x","proposer":"A"}'`.
- **JavaScript:** `analyze({text, proposer, enumerate, limit, check})`, or the
  pieces: `parseInstance(text)`, `deferredAcceptance(inst, "A"|"B")`,
  `allStableMatchings(inst)`, `checkStability(inst, aMatch)`, where
  `aMatch[i]` is the programme index of applicant `i` (or -1).

## Examples

All made up and labelled so on the page (`data/SOURCE.md` says why no real
preference data ships): a 12-resident, 4-programme match with 4 stable
matchings and three residents left out of all of them; a 4-applicant
instance with 5; and the cyclic 3 x 3, where the men-optimal matching gives
every man his first choice and every woman her third, the women-optimal one
the reverse, and the third stable matching gives everyone their second.

## Verification

- **Independent implementation:** `eval/make_reference.py` builds 250 random
  hospitals/residents instances (1 to 30 residents, 1 to 12 hospitals,
  capacities 1 to 4, complete and incomplete lists) and solves each with the
  Python `matching` package 1.4.3 (Wilde, Knight & Gillard 2020,
  doi:10.21105/joss.02169, MIT), resident-optimal and hospital-optimal.
  `engine.test.mjs` agrees exactly on all 500 matchings. The package was
  used only to produce `eval/reference.json`; none of its code is here.
- **Brute force:** on 1,000 small random instances (up to 6 applicants and 5
  programmes) the listing equals the set found by checking every possible
  matching for blocking pairs, with no repeats. A separate run of 3,000
  instances during development also agreed exactly.
- **Theorems as properties** (400 random instances): the applicant-optimal
  matching is every applicant's best stable outcome and the programme-optimal
  one its worst; the listing starts at the applicant-optimal matching; the
  rural hospitals theorem holds. 7 disjoint cyclic blocks give exactly
  3^7 = 2,187 stable matchings; 9 hit the limit and the result says so.
- **A bug found on the way:** the first version of the listing reached some
  matchings twice (about 1 in 75 on random instances, even one-to-one) and
  so its search tree grew far past the number of matchings: 3^7 blocks ran
  for 84 s and stopped at its work budget. McVitie & Wilson's rule that a
  break started at applicant i must not displace an earlier applicant
  removes the repeats; the same case now takes 63 ms.
- **Speed** (this container, Node 22): both deferred acceptance runs on 1,500
  applicants and 100 programmes of 12 places, 20 choices each, 12 ms; the
  2,187-matching listing, 63 ms.
- Run: `node --test engine.test.mjs cli.test.mjs page.test.mjs usage.test.mjs`.

## Limits

- Strict rankings only (no ties). Capacities on the second side only, one
  place each on the first. Couples, quotas, ties and many-to-many matching
  are not handled; the US residency match's couples rules (Roth & Peranson
  1999) are out of scope.
- The listing stops at 5,000 matchings; the egalitarian, minimum-regret and
  balanced picks are exact only when it finished.
- Stability is one definition of a good outcome, not the law or any
  programme's rules.

## Disclaimer

No warranty. Provided free and as-is. Not legal or professional advice.
Not affiliated with the authors of the cited papers or any matching
programme. Usage is counted only in the visitor's own browser
(`analysis_run`, `example_loaded`, `report_downloaded`), never with their
data, and off under Do Not Track or the page's opt-out.

FSL-1.1-MIT licence (`LICENSE`).
