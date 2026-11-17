---
title: "The check that only read script tags: three holes in a form-clobbering lint"
seo_title: "HTML form clobbering lint: inline handlers, form attribute, data-name"
date: 2026-11-17
tags: [redteam, ci, html, forms, testing]
description: "A red-team run found three ways past a CI check for form controls that hide form.reset(). It also found the same hyphen bug in the site's link checker."
---

On 2026-11-14 the "Reset saved inputs" button on two of our calculators threw
an error for every visitor. The cause is an old HTML quirk. A control inside a
`<form>` becomes a named property of that form, and the property beats the
method of the same name. So `<button id="reset">` makes `form.reset` the
button, and `form.reset()` fails with "form.reset is not a function". That
run added `platform/ci/check_form_clobbering.py`, which fails CI when a form
holds a control named after a form method that a script on the page calls.

Today's red-team run seeded ten faults into that check. Its tests caught nine.
The one that got through broke the default path used when the check runs with
no arguments, and no test ran it that way. Then we read the check the way an
attacker would and found three ways past it.

**Inline handlers were never read.** The check gathered calls from `<script>`
blocks and the page's own `.js`/`.mjs` files. `<button onclick="this.form.reset()">`
is neither, and it throws in exactly the same way. Handler attribute values
now count as script.

**The `form` attribute was ignored.** A control can sit anywhere in the page
and join a form with `form="f"`. It is then one of that form's elements and
hides its methods just as well. The check only looked between `<form>` and
`</form>`. It now works out which form owns each control: the form around it,
or the one its `form` attribute names. A `form` attribute that names no form
gives the control no owner.

**`data-name="reset"` failed the build.** The pattern `\b(?:id|name)=` matches
after a hyphen, because a hyphen ends a word. A data attribute that names
nothing was read as a control called `reset`. Attributes are now parsed by
their full name.

The same `\b` pattern was in `check_pages_links.py`, the check that follows
every link on the built site. There it did harm both ways. `data-id="compare"`
counted as a target for `#compare`, so a dead in-page link passed. And a
lazy-loading `data-src` pointing at a file that does not exist yet failed the
build. A one-character lookbehind, `(?<![\w-])`, fixes both. The new test is
split into two assertions for a reason. Our first version checked the total
count of problems, and it passed before the fix because the two errors
cancelled out: one missed problem plus one false one still made one.

None of the three holes had let a real bug onto the site. Searching every
venture page found no handler-attribute call and no `form=`-joined control
named after a method. So this run closed gaps before anything slipped through
them. The run record is
`prompts/runs/2026-11-17-session_01E5sJKik6BThGQESdSEJxXH.json`: 18 faults
seeded across two targets, 16 caught before the new tests and 18 after, and
four real defects in checks, all patched.
