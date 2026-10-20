# Secret Santa Draw

Free, browser-only Secret Santa generator. No sign-up, no email addresses, and
the organizer can play without seeing who drew whom.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/secret-santa-draw/

- **Rules:** nobody draws themselves; groups you name (couples, siblings) do not
  draw each other; last year's pairs are not repeated; and one of three pairing
  rules: swaps allowed, no swaps, or one big loop.
- **Group link:** the names, rules and one random number live in the URL
  fragment. Each person opens the link, picks their own name, and sees only their
  person. Nothing is stored on a server. The same link always recomputes the same
  draw on every device.
- **Next year:** paste last year's link and the new draw avoids every pairing
  from it, without anyone reading them.
- **Pass the phone:** an airtight single-device mode; a name disappears once used.
- **If no draw exists** the page names the people who are stuck (an exact
  bipartite matching check) and says which rule to relax.
- Exchange date as a calendar file, full list as CSV or text for organizers who
  would rather see it.

Open `index.html` over any static server (it is an ES module page). No build
step, no dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - parsing, the draw (shuffle with rejection, then matching and
  depth-first search), link encoding, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
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
