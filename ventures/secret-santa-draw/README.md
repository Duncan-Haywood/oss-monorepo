# Secret Santa Draw

Free, browser-only Secret Santa generator. No sign-up, no email addresses, and
the organizer can play without seeing who drew whom.

**Live tool:** https://marisstella.app/secret-santa-draw/

- **Rules:** nobody draws themselves; groups you name (couples, siblings) do not
  draw each other; last year's pairs are not repeated; and one of three pairing
  rules: swaps allowed, no swaps, or one big loop.
- **Group link:** the names, rules and one random number live in the URL
  fragment. Each person opens the link, picks their own name, and sees only their
  person. Nothing is stored on a server. The same link always recomputes the same
  draw on every device.
- **Next year:** paste last year's link and the new draw avoids every pairing
  from it, without anyone reading them.
- **Private links (2026-11-23):** one link per person, with Copy and Share
  buttons and a "copy every link as one message" list for DMs or an email
  merge. Each link holds only its giver's name, their match and the exchange
  details (`encodePrivate`), never the other names or the random number, so it
  cannot be used to look up anyone else's person. This closes the group link's
  honor-system gap without a server. The organizer also gets the group link as a
  private record for next year's no-repeat rule. Base64, not encryption:
  whoever opens a link sees its match, and the page says so.
- **Wish lists (2026-11-23):** after seeing their person, anyone can write a
  wish list and share a `#w=` link in the group chat; it holds only their name
  and ideas (600 characters), not whom they are buying for. Elfster-style
  wish lists, with no accounts.
- **Pass the phone:** an airtight single-device mode; a name disappears once used.
- **If no draw exists** the page names the people who are stuck (an exact
  bipartite matching check) and says which rule to relax.
- Exchange date as a calendar file, full list as CSV or text for organizers who
  would rather see it.

## White elephant game host (2026-11-18)

`white-elephant.html` runs a white elephant (Yankee swap) game on one screen:
drawn turn order, open or steal, gifts frozen after N steals, no stealing
straight back, an optional cap on steals per turn, and player one's final swap.
Every greyed-out steal says why. Saved in local storage after each move, with
undo; CSV or text of the final gifts.

- `elephant.mjs` - the engine: pure functions over a JSON state (`newGame`,
  `apply`, `moves`, `stealBlock`, `maxMoves`, `simulate`).
- `elephant.test.mjs` - 3,000 random games with random house rules, invariants
  checked after every move (no one holds two gifts, everyone who has gone holds
  one, no gift past its limit, refused steals carry a reason, length within
  `maxMoves`).
- `white-elephant-rules-steal-limits.html` - the rules, and a table from
  `eval/elephant-length.mjs` (output in `eval/elephant-length.txt`): 2,000
  simulated games per row under a toy policy (steal with probability 0.5 when
  allowed). At 20 players a two-steal freeze leaves the median at 38 moves, the
  same as three; one steal per turn cuts it to 30 and the 90th percentile from
  47 to 33. The page test checks every row against the script.

Why: this product had the most page loads on the site in the two weeks to
2026-11-18 (198, `usage-data` branch, `site-visits.json`), with the
gift-exchange season ahead; white elephant is the other gift game people search
for in December. Not yet measured: whether visitors use it (`we_*` counters are
local only).

Open `index.html` over any static server (it is an ES module page). No build
step, no dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - parsing, the draw (shuffle with rejection, then matching and
  depth-first search), link encoding, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `private.test.mjs` - private and wish list links: 200 random groups (3 to 42 people), every link decodes to its own giver and the draw's receiver and holds no other participant's name; forged and damaged links refused.
- `secret-santa-rules-for-couples-and-no-repeats.html` - guide whose worked
  counts the test suite recomputes from the engine.
- `how-many-people-do-you-need-for-secret-santa.html` - guide with a table of valid draws for 3 to 8 people under each pairing rule; the counts are recomputed by the test suite.
- `secret-santa-for-remote-teams-without-email.html` - guide to running a remote-team exchange from one group link, with the honor-system limit stated.

**No warranty.** Free and as-is; a friendly gift-exchange helper. The group link
works on the honor system: it contains what is needed to recompute the draw, so
a determined technical person could work out every pairing. Use Pass the phone
when that matters. The random number is not cryptographic.

**Privacy.** Everything runs in your browser; names and results are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
