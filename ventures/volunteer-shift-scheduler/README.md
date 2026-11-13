# Volunteer Shift Scheduler

Free, browser-only volunteer schedule maker for church, school PTA, food bank,
youth sports and event coordinators. Paste the volunteers (days they can do,
maximum shifts, roles they cannot do, dates they are away), list the shifts (date, slot, role, how
many people), and it builds a roster that never double-books anyone, never
exceeds a maximum and respects availability and excluded roles. Unfilled places
are listed with the reason, and over- or under-loaded volunteers are flagged.
Exports a CSV, a calendar (.ics) file for the whole roster or one volunteer,
plain-text reminder messages and a share link (the typed text, encoded in the
URL fragment, which browsers never send to a server). Nothing is uploaded.

**Live tool:** https://marisstella.app/volunteer-shift-scheduler/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsers for slots, shifts and volunteers; the assignment (hardest
  shifts first, fewest-shifts-so-far picking, a one-move repair pass for empty
  places, a balance pass); an independent validator; CSV, iCalendar, reminder
  and text exports; the share-link codec. Deterministic: no randomness.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-schedule-volunteers-fairly.html` - guide with a worked ten-volunteer
  example that the test suite recomputes.

**No warranty.** Free and as-is; an organising aid, not legal or financial
advice. It does not replace your organisation's rules or any safeguarding or
background-check requirement. Check every name, date and role before you send a
roster to anyone.

**Privacy.** Everything runs in your browser; names and availability are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.
A share link contains the names you typed, so send it only to people who should
see them.

MIT licence, see `LICENSE`.

## Known gaps

From the round-65 quality audit ([`portfolio/quality/audits/2026-11-13-volunteer-shift-scheduler.json`](../../portfolio/quality/audits/2026-11-13-volunteer-shift-scheduler.json)):

- Roles can only be excluded, not required: a new volunteer is eligible for a safeguarded role (children, driving) until someone adds `not:` for them. A "cleared for" list per role is the safer default.
- Slash dates are read as month/day/year only; 05/11/2026 is 11 May. Use 2026-11-05 to be unambiguous.
- The one-move repair pass can leave a fillable place empty on large sparse rosters (2.6 to 5.3% of random 10 to 50 shift rosters in the audit); the unfilled reason then reads as if the gap were unavoidable.
- Calendar UIDs change when a shift or volunteer is added, and long lines are folded by characters rather than octets.
