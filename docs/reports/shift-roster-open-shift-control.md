# shift-roster-builder: open-shift control landed (2026-10-27)

- `openShiftWeight` is now reachable: CLI `--open-shift-hours`, page select `#openpref`. An explicit weight enables `coverRepair` in `calc.mjs`.
- Tests: `cli.test.mjs` (new, passes), `page.test.mjs` (new wiring test passes).
- Known pre-existing failure here: `page.test.mjs` "call-out page's table" gets 24, expects 22, with or without this change (time-limit dependent exact search). Re-derive on a faster machine before trusting it.
- Next: the person-day clique cut for 12x30 week 1 (72 vs 75).
