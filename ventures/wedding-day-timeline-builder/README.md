# Wedding Day Timeline Builder

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wedding-day-timeline-builder/>

Free, browser-only wedding day timeline. Enter the date, a nearby city, the
ceremony time and the time the music has to stop, and get a minute-by-minute
schedule:

- **hair and makeup** start time worked backwards from when the dress goes on,
  with the list split across your artists (longest job first) and each person's
  start and finish shown;
- a **first look** plan (first look, couple, wedding party and family portraits,
  all before the ceremony) or, without one, the same portraits after the
  ceremony and how many minutes the cocktail hour stretches while guests wait;
- ceremony, optional travel to a second venue, cocktail hour, entrance, first
  dance, parent dances, dinner (length from the meal style and guest count),
  toasts, cake, and open dancing as whatever time is left before the curfew;
- **sunset** computed from the date, latitude and longitude (NOAA formulas,
  checked against almanac values), and a 15-minute **golden-hour portrait** slot
  placed as an overlay on the couple's free time so no other event moves;
- a **ceremony time advisor** that rebuilds the whole day at every half hour from
  10:00 AM to 7:30 PM and scores it (fits before the curfew, outdoor ceremony
  ends before sunset, sunset slot free, cocktail hour not stretched);
- sheets for **everyone, the couple, the wedding party, family, the photographer,
  the DJ and the caterer**, printable, as a calendar file (.ics), CSV and plain text.

Save a timeline to a file and load it again. Nothing is uploaded.

Open `index.html` over any static server (it is an ES module page). No build
step, no dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - city presets, sun and time-zone maths, hair and makeup scheduler,
  the day builder, the advisor, views and exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `wedding-photography-timeline.html` - guide with a worked with/without-first-look
  comparison that the test suite recomputes from the engine.

**No warranty.** Free and as-is; general planning guidance, not professional
wedding-planning advice. The durations are common planning conventions you can
change; confirm every time with your vendors and venue. No venue, vendor or brand
is named or ranked.

**Privacy.** Everything runs in your browser; dates and choices are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
