# Parish office

Free, open-source tools for the parish office, starting with **the Mass
intentions book**: record intentions and offerings, list the Masses, book
intentions into them, and check the book against canons 948 to 958 of the
Code of Canon Law. Runs in the browser; nothing is uploaded.

**Live tool:** https://marisstella.app/parish-office/

After using this, you can now **see which intentions are near or past a year,
which Masses carry two offerings, and what a second Mass's offering or a short
transfer owes**, which used to take reading back through the paper book before
the annual review.

## Use

- Page: open `index.html` (it needs to be served, for example
  `python3 -m http.server`, because it loads `intentions.mjs` as a module).
- CLI: `node cli.mjs examples/sample-book.json --today 2026-11-03` prints the
  findings; `--csv`, `--book`, `--summary 2026`, `--lump 10500 --offering 1000`,
  `--json`. Exit code 1 means a high finding.
- Engine: `intentions.mjs` (`check`, `status`, `autoBook`, `registerCsv`,
  `yearSummary`, `massesFromLumpSum`). Book format: see
  `examples/sample-book.json` (money in cents, dates `YYYY-MM-DD`).
- Tests: `node --test intentions.test.mjs cli.test.mjs usage.test.mjs page.test.mjs`.

## Checks

| Canon | Check |
|---|---|
| 948 | two or more offered intentions on one Mass |
| 950 | Masses from a lump sum at the local offering |
| 951 §1 | a priest with offered intentions at several Masses in a day: one offering kept, the rest to the ordinary's purposes (not on 25 December) |
| 951 §2 | an offering on a concelebrated later Mass the same day |
| 953 | more open intentions than a year of free Masses |
| 954 | an intention passed on against the donor's express wish |
| 955 §1 | less than the whole offering passed on, unless marked as a personal gift (and then at least the diocesan amount) |
| 955 §2, 956 | the one-year clock from the day received: a warning before, and past a year "to the ordinary" |
| 958 §1 | the register: number of Masses, intention, offering, celebration |

Canon text is quoted from the English translation on
[vatican.va](https://www.vatican.va/archive/cod-iuris-canonici/eng/documents/cic_lib4-cann879-958_en.html),
fetched 2026-11-03. **Not modelled:** collective intentions under the 1991
decree of the Congregation for the Clergy, foundation Masses, the Mass for the
people, the extrinsic-title recompense in c. 951 §1, and diocesan particular
law beyond the offering amount you type.

The CSV export prefixes cells that start with `=`, `+`, `-` or `@` with `'`
so a spreadsheet does not run them as formulas; that includes the common
`+ Name` for the deceased, which shows as `'+ Name` in a text editor and as
`+ Name` in a spreadsheet.

## Verification

2026-11-03: 21 engine and CLI tests plus the usage and page tests pass
(`node --test`). The sample book is made up. Not yet tried on a real parish's
book; that is the first item under "Wanted" in `ROADMAP.md`.

## Roadmap

The standard problems of a parish office, as modules: `ROADMAP.md`.

## Privacy

Everything runs in your browser. The book is kept in this browser's local
storage and is never uploaded; back it up as JSON. Usage counts hold only
feature names, stay in the browser, and respect the checkbox, Do Not Track and
Global Privacy Control.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not canonical, legal, tax, or financial advice, and it does not
replace your diocese's own rules, your chancery or a canon lawyer. **You are
responsible for reviewing and verifying its output before relying on it.** To
the maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use. Best-effort hosting, no SLA; do not use
this as a system of record. MIT licensed (`LICENSE`).
