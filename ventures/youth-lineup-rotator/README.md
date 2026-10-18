# Youth Lineup Rotator

Free, browser-only lineup planner for volunteer youth-sports coaches. Type the
roster and the positions on the field; get a period-by-period lineup with fair
playing time and the substitutions spelled out. No sign-up, nothing uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/youth-lineup-rotator/

- **Fair time:** bench turns are spread so nobody plays more than one period more
  than anybody else (when no one is absent or restricted), nobody sits two periods
  in a row if the numbers allow, and the page names anyone it could not help.
- **Positions:** presets for soccer 5v5, 7v7, 9v9, 11v11, basketball, hockey,
  lacrosse and volleyball, or type your own (`GK, DEF x2, MID x2, FWD x2`).
  Per player: `skill: 1-5`, `can: GK, DEF`, `not: GK`, `late: 1`, `leaves: 3`,
  `sat: 2`.
- **Goalkeeper turns:** at most one period per child by default; if too few are
  allowed in goal the page says who must repeat.
- **Strength balance:** with skills entered, total skill on the field is kept even
  across periods.
- **Season fairness:** "Copy next game's roster" writes `sat:` for every child who
  sat; pasted into the next game they are first in line to play.
- **Outputs:** copy as text for the team chat, CSV, a printable sideline sheet, a
  note per family, and a link that restores the setup.

Open `index.html` over any static server (it is an ES module page). No build
step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, the cost function, greedy start plus seeded simulated
  annealing, validators and exports. Deterministic for a given seed.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-give-every-kid-equal-playing-time.html` - guide whose worked table the
  test suite recomputes, and checks the engine achieves.

Tests validate every lineup against the hard rules, check fairness on a range of
roster sizes, and compare the search with an exhaustive search on small teams.

**Not modelled:** minute-level rotations, league minimum-play rules, formations
that change mid-game. **No warranty.** Free and as-is; not league-rules, safety
or legal advice.

**Privacy.** Everything runs in your browser; names and ratings are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
