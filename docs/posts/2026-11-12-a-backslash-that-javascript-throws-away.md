---
title: "A backslash JavaScript throws away: eleven calendar exports that never escaped a semicolon"
seo_title: "Unescaped semicolons in JavaScript iCalendar and vCard exports"
date: 2026-11-12
tags: [icalendar, vcard, javascript, testing, mutation-testing]
description: "In JavaScript the string \"\\;\" is a plain semicolon, so eleven of our .ics and vCard exporters never escaped one. The fix and the guard."
---

RFC 5545, the iCalendar standard, says a semicolon or comma inside an event's
title or description has to be written with a backslash in front: `Lunch\; then
review`. Most of the products in this catalogue that hand you a calendar file
have a one-line helper that does it:

```js
.replace(/;/g, "\;")
```

That line does nothing. In a JavaScript string, a backslash before a character
that isn't a known escape is dropped, so `"\;"` is the same string as `";"`.
The helper replaces every semicolon with a semicolon. The version that works
needs two backslashes, `"\\;"`.

## How it turned up

This morning's red-team run started with a defect an earlier run had left open:
ten generators wrote lines longer than the 75 octets RFC 5545 asks for. Each
now folds its output, splitting long lines with a leading space on the
continuation, and never inside a multi-byte character. To keep that fixed, the
test that runs every product's calendar export through our own
[ICS calendar checker](https://marisstella.app/ics-calendar-check/) now fails on
a long line as well as on an error.

While adding that, we also made the same test reject a bare `;` or `,` in a
text value. It failed on two products we hadn't touched. Searching for the
pattern found eleven copies across ten products:

- calendar exports in the COI expiry checker, the e-invoicing mandate
  calendar, the invoice payment terms calculator (twice), the late-invoice
  collections kit, meeting action items, the SaaS renewal planner, Slot Keeper,
  the vegetable garden planting calendar and the wedding day timeline builder;
- and the vCard checker, where a name part holding a `;` lost its escape when
  the checker built a display name from it.

A twelfth, the shift rotation schedule generator, didn't escape the crew name
at all.

## Why the tests didn't see it

Four of these products had a test whose title said it checked escaping. All
four passed, and all four checked the wrong thing:

```js
assert.match(ics, /SUMMARY:A\\, B\; C/);
```

Inside a regular expression `\;` is also just `;`. So the test asked for a
bare semicolon and got one. Same mistake, made twice, and the second copy hid
the first.

## What changed

- All eleven escapers now use `"\\;"`, and the four tests now look for a
  real backslash. The shift rotation export escapes its title.
- The calendar checker's dogfood test now fails when any product's export has
  an unfolded line or an unescaped `;` or `,` in SUMMARY, DESCRIPTION,
  LOCATION or COMMENT.
- The same test scans every product's source for a `.replace(...)` whose
  replacement is a single backslash before `;` or `,`, so a new copy fails
  before it ships. We checked each guard by putting the old code back: it
  failed.

How much did it matter? Most calendar apps forgive a bare semicolon in a
title. Stricter parsers, and anything that splits a value on `;`, don't. A
vCard name is split on `;` by design. It's the kind of bug nobody reports,
because the event still shows up, a bit wrong.

## The rest of the run

The run then seeded 16 deliberate faults in two files, the calendar checker
itself and the percentage rent audit checker. The existing tests caught 9. The
seven that got through all hit a boundary at zero: midnight (`BYHOUR=0`)
reported as invalid, a trailing blank line kept, warnings sorted in with
info notes, zero gross sales refused, and a dispute letter that would have said
"a difference of $0.00" and listed an item worth nothing. Each now has a test,
and all seven are caught on a rerun.

All of these are free, open-source tools. The calendar checker runs in your
browser and doesn't upload your file. Their results are checks against the
published standards, not a guarantee that any given app will import the file.
