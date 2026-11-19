---
title: "An English-shaped plural is wrong for every Polish number but one: an ICU MessageFormat checker"
seo_title: "Free ICU MessageFormat checker for plurals and translations"
date: 2026-11-19
tags: [ventures, icu-message-check, i18n, developer-tools, product]
description: "A free checker for ICU MessageFormat strings and translation files, and what CLDR's plural rules say about the one/other message most apps ship."
---

Most apps that support more than one language store their strings in ICU
MessageFormat: react-intl and FormatJS on the web, ICU4J on the JVM, and
Flutter's ARB files all use it. The format handles plurals like this:

```
{count, plural, one {# file} other {# files}}
```

That message is correct in English and wrong in many other languages. The
plural forms a language uses are defined by the Unicode CLDR plural rules,
and every browser ships those rules as `Intl.PluralRules`. So I counted.

## What the rules say about a one/other plural

The runtime here (Node 22.23.5, ICU 78.3, CLDR 48.0) has plural rules for
217 languages. A message with only `one` and `other` is complete for 136 of
them (two categories) and has a spare branch in the 32 that use only `other`
(Japanese, Chinese, Korean, Thai, Vietnamese and others).
For **41 languages** at least one integer from 0 to 100 lands in a category
the message does not have, so the reader sees the `other` text:

| Language | Integers 0–100 shown with the wrong form | Categories CLDR defines |
|---|---|---|
| Polish | 100 of 101 | one, few, many, other |
| Arabic | 99 of 101 | zero, one, two, few, many, other |
| Russian, Ukrainian, Belarusian | 92 of 101 | one, few, many, other |
| Lithuanian | 72 of 101 | one, few, many, other |
| Croatian, Serbian, Bosnian | 27 of 101 | one, few, other |
| Latvian | 20 of 101 | zero, one, other |
| Romanian | 19 of 101 | one, few, other |
| Czech, Slovak, Slovenian | 3 of 101 (2, 3, 4) | Czech/Slovak one, few, many, other; Slovenian one, two, few, other |
| Hebrew | 1 of 101 (2) | one, two, other |

Polish is the extreme case. CLDR keeps the Polish `other` category for
fractions ("1,5 pliku"), and every whole number except 1 is either `few`
(2–4, 22–24, …) or `many` (0, 5–21, 25–31, …). A Polish translation that copies
the English shape therefore shows the fractional form for every count but one.
The full list, with the first numbers each language gets wrong, comes from
a script in the repository, so anyone can rerun it on a newer CLDR
(`ventures/icu-message-check/eval/cldr-survey.mjs`).

There is also the reverse mistake: `zero` in an English message. English
has no `zero` category; CLDR puts 0 in `other`, so `zero {No files}` is never
shown. Ten languages define `zero` (Arabic, Welsh, Latvian, Cornish and
others). Everywhere else, `=0` is how you write a special text for exactly
zero.

## The other bug: one apostrophe

Another bug that only shows up in translation is an apostrophe. In ICU
MessageFormat a single `'` directly before `{` starts quoted literal text,
so the French

```
Supprimer l'{item} ?
```

prints `Supprimer l{item} ?`: the quote runs to the end of the message and
the placeholder is never filled in. French and Italian elision (`l'`, `d'`,
`dell'`) puts an apostrophe right before a value all the time. The fix is
`l''{item}` or the typographic apostrophe `’`; the
[guide](https://marisstella.app/icu-message-check/apostrophes-in-icu-messageformat.html)
has the full rule and a table of cases, each pinned as a test.

## The checker

[ICU Message Check](https://marisstella.app/icu-message-check/) takes one
message or a set of JSON/ARB translation files and reports:

- syntax errors with the column, and the likely fix for typos like `plurl`
  or `{user.name}` (ICU names cannot contain `.`);
- apostrophes that swallow a placeholder;
- for each file's language, the plural categories a message lacks and the
  numbers that would fall to `other` ("in pl numbers such as 2, 3, 4, 22,
  23, 24… will show the other text"), and categories that language never
  selects;
- what a translation changed against the source: a dropped or renamed
  placeholder (`{nom}` for `{name}`, with "did you mean"), a plural turned
  into plain text, and missing `select` options;
- for one message, the text a reader sees for an example number in each
  category.

It runs in the browser, and nothing is uploaded. The same checks run as a
Node CLI with no dependencies that exits 1 on an error, so it can sit in CI
for the translation files that arrive from a vendor after code review.

## How I know the parser is right

I wrote the parser from the ICU user guide and the ICU4J `MessagePattern`
documentation, then checked it against formatjs, an independent
implementation, on 100,000 generated messages (half of them with a random
one-character edit). The two agreed on every accept/reject decision except
64 messages where ICU4J and formatjs themselves differ (brace counting
inside a number style; the checker follows ICU4J). They produced identical
text in all 362,411 formatted comparisons across seven locales, apart from
112 where ICU formats a bare `{n}` with the locale's number format and
formatjs does not. Building the comparison found three bugs in my
first version, all fixed: the details are in the
[differential record](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/icu-message-check/eval/differential-2026-11-19.md).

What it does not do: judge whether a translation is accurate, check gender
or case agreement, or parse MessageFormat 2. A native-speaking reviewer
still checks the meaning. The checker covers the structural mistakes that
show up as "5 plik" or a literal `{item}` on screen.
