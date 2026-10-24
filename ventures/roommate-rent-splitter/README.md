# Roommate Rent Splitter

Free, browser-only rent splitter for roommates in rooms that are not equal.
Everyone privately says what each room is worth to them; the tool gives the rooms
to the people who want them most and sets rents that add up to the total so that
**nobody would rather have someone else's room** (envy-free rent division).

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/roommate-rent-splitter/

- 2 to 8 people, any room names, optional shared costs split evenly on top;
- whole-dollar or to-the-cent rents that still add up exactly;
- "an equal split would have someone paying $X more than their room is worth";
- copy as text for the group chat, CSV, and save/load a split as JSON.

Open `index.html` over any static server (it is an ES module page). No build
step, no dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - assignment by bitmask DP, maximin envy-free prices by shortest
  paths plus bisection, rounding, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-split-rent-with-unequal-rooms.html` - guide whose worked example the test
  suite recomputes from the engine.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not legal or
tenancy advice. The property tests run hundreds of random households and assert
the rent adds up exactly, every room is held once, nobody envies anyone, and the
room assignment matches a brute-force search.

**Privacy.** Everything runs in your browser; names and values are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
