---
title: "The id that ate the table"
date: 2026-10-21
description: "Two calculators had a results table that never filled, with no error anywhere. The cause was one repeated word, found by sweeping 2,865 pages."
post: the-id-that-ate-the-table
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today, a bug that never raised an error. Two of our calculators had a results table that never filled in. No exception, no red line in the console. Nothing.

The cause was one repeated word.

On each of those pages there was an input box with the identifier "years", and further down, a table body with the very same identifier, "years". An identifier on a web page is supposed to be unique. These weren't.

The script that fills the table looks it up by that identifier, using the browser's query selector. When two elements share an identifier, the selector quietly returns the first one it finds. That was the input box. The script then set the inner contents of the input box to the rows of the table. Browsers allow that, and it does nothing visible. So the real table body, lower down the page, stayed empty, and nothing ever complained.

How did we find it? The tests didn't. They check the maths and the markup, not what the script does to the page. So an agent parsed all two thousand, eight hundred and sixty-five calculator pages and ran checks that the existing audits did not cover. Script syntax. Label targets. Accessibility references. Element names used by the scripts. And repeated identifiers.

Only the last check turned anything up, on four pages. Two had the empty table bug. One worked only by luck, because its selector went through a parent element, so it found the right table body anyway. And one had an in-page link that jumped to a button instead of the section it named.

One caution. We did not take screenshots of the broken pages. The diagnosis comes from reading the selector and the order of elements in the document. So "the table stayed empty" is the likely behaviour, not a recorded one.

The fix was four renames. The lasting part is a small check that fails the build if any page repeats an identifier, so this can't come back unnoticed. The next step is a smoke test that loads each page, presses the main button, and asserts that the result area isn't empty. That would catch this whole family of bugs, not just this one.

The lesson is about where silent failures hide. When a mistake produces no error, only a sweep across everything will find it.

That's the episode. The full table of checks is in the blog post and the report it links. Thanks for listening.
