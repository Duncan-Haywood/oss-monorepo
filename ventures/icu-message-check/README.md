# ICU Message Check

Your Polish users see "5 plik" instead of "5 plików", or your French build
says `Supprimer l'{item} ?` with the braces showing. Both come from ICU
MessageFormat strings that look fine in English. Paste a message, or drop
your JSON or ARB translation files, and this tool tells you:

- **syntax errors** as ICU parses the message, with the column and, for
  typos like `plurl` or `{user.name}`, the likely fix;
- **apostrophes that swallow a placeholder**: a single `'` before `{` starts
  quoted literal text in ICU, so `l'{item}` prints `l{item}`;
- **plural forms each language needs**: the CLDR categories for the file's
  locale (Polish one/few/many/other, Arabic all six, Japanese only other),
  which ones a `plural` or `selectordinal` lacks, and example numbers that
  would show the `other` text instead (`2, 3, 4, 22, 23, 24…` for Polish
  `few`); also categories the locale never selects (`zero` in English, where
  `=0` is meant) and a `select` written with plural keywords;
- **what a translation changed** compared with the source file: a dropped or
  renamed placeholder (`{nom}` for `{name}`, with the suggestion), a plural
  turned into plain `{n}`, `select` options missing or added, and keys not
  translated;
- **what readers see**: for one message, the text for an example number in
  each plural category of the chosen language.

Live: <https://marisstella.app/icu-message-check/> · Guide:
[apostrophes in ICU MessageFormat](apostrophes-in-icu-messageformat.html)

## Use it

In a browser: open `index.html` (any static server; plain ES modules).

From a terminal or CI (Node.js 20+, no dependencies):

```
node cli.mjs locales/en.json locales/fr.json locales/pl.json   # first file is the source
node cli.mjs --source en.json locales/*.json --strict
node cli.mjs lib/l10n/app_en.arb lib/l10n/app_pl.arb --json
node cli.mjs locales/app.json:pt-BR ...                         # set a locale the name can't show
node cli.mjs --message "{n, plural, one {# file} other {# files}}" --locale pl
```

Exit codes: 0 no errors (warnings allowed), 1 an error (or a warning with
`--strict`), 2 bad arguments or an unreadable file. Try it on the bundled
`examples/` (4 errors, 5 warnings, each a real class of bug).

File formats: flat or nested JSON (nested keys are joined with `.`), formatjs
extracted files (`{"key": {"defaultMessage": "…"}}`), `{"key": {"message":
"…"}}`, and Flutter ARB (`@`-keys are metadata; `@@locale` sets the locale).
The locale comes from `@@locale`, then the file name (`fr.json`,
`pt-BR.json`, `app_pl.arb`, `messages.de.json`, `intl_en_US.arb`), then
`file:locale` on the command line or the table on the page.

## What it checks

| Severity | Finding |
|---|---|
| error | syntax ICU rejects (unclosed `{`, missing `other`, duplicate selectors, unknown argument type, `.` or `-` in a name, `=x` selectors, offset after a selector, ChoiceFormat); an apostrophe quote that contains a placeholder; a plural keyword that is not a CLDR category (`on`, `2`); a translation that drops a source placeholder or uses one the source lacks |
| warning | a plural/selectordinal missing a category the locale uses (with the integers that would fall to `other`, after any `offset:` and `=N` selectors); a category the locale never selects; a `select` whose options are plural keywords; an unterminated quote; a stray `}`; a typo of a number or date style; a translation that changes `plural`/`select` into another kind; `select` options missing or added |
| info | a category reached only by decimals (`1.5` in French `one`); `#` outside a plural; a key not in the source; a number formatted differently from the source |

## Sources and verification

- ICU MessageFormat syntax and the apostrophe rule (`DOUBLE_OPTIONAL`, ICU's
  default): ICU User Guide,
  [Formatting Messages](https://unicode-org.github.io/icu/userguide/format_parse/messages/),
  and the ICU4J API documentation for
  [MessagePattern](https://unicode-org.github.io/icu-docs/apidoc/released/icu4j/com/ibm/icu/text/MessagePattern.html).
  The parser is original code written from those documents.
- Plural categories: Unicode CLDR
  [plural rules](https://cldr.unicode.org/index/cldr-spec/plural-rules),
  read at run time from the browser's or Node's own data through
  `Intl.PluralRules` (`resolvedOptions().pluralCategories` and `select()` over
  0..1000, a few large round numbers and 0.1..9.9). So the checker is as
  current as the runtime, and no table is copied into this repository.
- Differential check: `eval/differential.mjs` against formatjs (an
  independent implementation) on 100,000 generated messages over five seeds:
  0 unexplained parse disagreements and 0 unexplained differences in 362,411
  formatted strings across 7 locales. The two known differences, where this
  checker follows ICU4J, and three bugs the run found and fixed are in
  [`eval/differential-2026-11-19.md`](eval/differential-2026-11-19.md).
- Who would sign it off: a localisation engineer reviewing vendor
  translations before release. The tests pin the CLDR facts the findings
  rest on (Polish `few` = 2, 3, 4, 22, 23, 24…; English has no `zero`; Arabic
  uses all six categories; English ordinals one/two/few/other), the guide's
  table of apostrophe cases, and the example files' counts.

## What it does not model

- **MessageFormat 2** (Unicode MF2, `.match`/`.input` syntax) is a different
  language and is not parsed.
- **Flutter `gen_l10n` without `use-escaping: true`** treats apostrophes as
  text, so the apostrophe finding does not apply there.
- The JDK's own `java.text.MessageFormat` quotes on **every** single
  apostrophe; this checker follows ICU's rule.
- FormatJS **rich-text tags** (`<b>…</b>`) are read as plain text.
- Number and date **skeletons and patterns** (`::currency/EUR`, `yyyy-MM-dd`)
  are parsed and kept but not validated, and previews show them in the
  default format. `spellout`, `ordinal` and `duration` need ICU's rule-based
  formats, which browsers lack; previews show digits.
- Gender, case and other grammar beyond plural categories, and whether a
  translation is accurate.

## Layout

- `icu.mjs`: parser, linter, comparison, catalogue reader, formatter.
- `cli.mjs`: command line. `index.html`: the browser tool.
  `apostrophes-in-icu-messageformat.html`: the guide.
- `usage.mjs`: anonymous local usage counts (event name and day in the
  visitor's own browser storage; never the messages; opt-out on the page).
- `eval/`: the differential check against formatjs and its results.
- Tests: `node --test icu.test.mjs cli.test.mjs page.test.mjs usage.test.mjs`.

FSL-1.1-MIT licensed. Not affiliated with the Unicode Consortium, ICU or FormatJS.
