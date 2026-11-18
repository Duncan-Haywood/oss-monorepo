# Parish office: roadmap

The owner, 2026-11-03: "it'd be nice to build tools for catholic orgs.
parishes. relgiious orgs. as a direction" and "standard problems they have."

This venture is the home for that direction. The aim is one free, local-first
parish office that a parish secretary can run without a subscription, built a
module at a time, each module useful on its own and each checked against the
rule it rests on (canon law, IRS rules, the diocese's own policy as typed by
the user). Most modules also fit other congregations; where a module is
Catholic-specific it says so.

Sources rule: a canon or a statute is quoted only from its official text
(vatican.va for canon law, the IRS or the US Code for tax), fetched in the run
that cites it. A rule we have not read stays out of the checks and goes in
"Not modelled".

## Landed

| Module | What it does | Checked how |
|---|---|---|
| Mass intentions book (`intentions.mjs`, `index.html`, `cli.mjs`) | The c. 958 book: intentions, offerings, Masses, transfers; booking into free Masses; checks for cc. 948, 950, 951 §1-2, 953, 954, 955 §1-2, 956; register CSV; year summary for the c. 958 §2 review | 21 engine and CLI tests on hand-made books and a made-up sample parish (2026-11-03). Canon text fetched from vatican.va the same day. Not yet tried on a real parish's book. |

## Next, most useful first

The standard problems a parish office has, as modules. Each is a slice for a
later run; replace the line with a row above when it lands.

1. **Sunday collection count sheet.** Two counters, each count entered
   separately, a mismatch shown before the bag is sealed, envelope and loose
   cash totals, deposit slip, and a running reconciliation of counts to bank
   deposits. The internal control every diocesan finance office asks for, and
   the one most often done on paper. Shared by every congregation.
2. **Contribution statements.** Year-end giving statements from an envelope
   or online-giving export, with the IRS written-acknowledgment wording for
   gifts of $250 or more and a quid pro quo note where a donor received
   something back. Quote IRS Publication 1771 before writing the checks.
   Shared by every congregation.
3. **Sacramental registers and certificates.** Baptism, confirmation, first
   communion, marriage and funeral entries; certificates printed from the
   entry; notations owed to and from other parishes, tracked until sent.
   Quote the canons on registers (Book II, the parish) before adding checks.
   Catholic-specific in its details.
4. **Safe-environment compliance tracker.** Training and background-check
   dates for clergy, staff and volunteers, with each diocese's renewal
   interval typed by the user, and a list of who must not be scheduled yet.
   Feeds the minister scheduler.
5. **Minister scheduler.** Lectors, extraordinary ministers, servers, ushers
   and musicians across the Mass list from the intentions book, with
   availability, couples together, swap requests and a printable schedule.
   Only people cleared by the compliance tracker are scheduled.
6. **Liturgical calendar.** The date of Easter and the moveable feasts for
   any year, holy days of obligation as the user's conference sets them, and
   the calendar feeding the Mass list and the bulletin. The Easter
   computation is checkable against published tables.
7. **Religious education and sacramental preparation.** Registration, class
   lists, attendance, family fees and sibling discounts, and the sacrament
   each child is preparing for.
8. **Diocesan assessment and annual report.** The assessment on the income
   base the diocese defines (typed by the user), and the year's figures in
   the layout the diocese asks for, from the ledger in `ai-bookkeeper`.
9. **Facilities and cemetery.** Hall and room booking with conflicts; plot
   map, interment records and perpetual-care funds.

Related tools already in the portfolio: `clergy-housing-allowance-calculator`
(US minister's housing allowance), `donor-acknowledgment-letter-generator`,
`volunteer-shift-scheduler`, `ai-bookkeeper` (fund-style books).

## Wanted from the world

- A real parish's Mass intentions book (anonymised) to run the checks on.
- A diocese's published decree on the Mass offering amount and on where
  bination offerings go, to add as presets.
- The 1991 decree on collective intentions in an official text we can fetch,
  before adding its checks.
