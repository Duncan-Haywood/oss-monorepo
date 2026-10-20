# Tournament Pairing Manager

Free, browser-only tournament runner for chess clubs, pickleball, darts, table
tennis, esports and school events. Paste the players (ratings optional) and pick
a format:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tournament-pairing-manager/

- **Swiss**: round-by-round pairings with colour (White / home) balance, a bye
  for an odd field, no rematches, standings ranked by score then Buchholz,
  Buchholz cut 1, Sonneborn-Berger, wins and progressive score; configurable
  win / draw / bye points; withdrawals; undo a round.
- **Single elimination**: standard seeding, byes for the top seeds, optional
  third-place match.
- **Double elimination**: winners bracket, losers bracket with drop-ins ordered
  to delay rematches, grand final with optional bracket reset.

Brackets are derived from the winners you click, so changing an earlier result
clears the matches that depended on it. Save the event to a JSON file and load it
again later, export the standings as CSV, or copy the pairings as plain text.
Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, Swiss pairing by lowest-cost whole-round search,
  tiebreak standings, bracket builder and resolver, validators, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-run-a-swiss-tournament.html` - guide with a worked eight-player event
  that the test suite recomputes.

**No warranty.** Free and as-is; an organising aid, not legal or financial advice
and not an implementation of any federation's official pairing rules. Check every
pairing and result before you publish it or send it to a rating body. Tested with
seeded random events of 4 to 32 players: no rematches, one game per player per
round, byes spread evenly, nobody eliminated from a double-elimination bracket
before a second loss.

**Privacy.** Everything runs in your browser; names and results are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
