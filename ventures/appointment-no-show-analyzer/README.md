# Appointment No-Show Analyzer

A free browser tool for appointment-based businesses (salons, barbers, dentists and chiropractors,
tutors, personal trainers, mobile detailers): **drop in your booking export and see how many
appointments you lose to no-shows and late cancellations, what it costs, and who and when.** The
file is read in the browser. Nothing is uploaded and no scheduling-app login is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/appointment-no-show-analyzer/

After using this, you can now **see your no-show rate and late-cancel rate, the revenue lost, the
weekdays, hours, services and lead times that get missed, your repeat no-show clients with the
dollars they cost, and a typed-assumption estimate of what a deposit or no-show fee would
recover**, which used to mean a pivot table over a Square Appointments, Acuity, Calendly, Vagaro,
Fresha or Booksy export.

To design the policy itself, use [`no-show-fee-calculator`](../no-show-fee-calculator/) and
[`appointment-deposit-calculator`](../appointment-deposit-calculator/); this tool measures the
problem first, and they link to it.

## Input

- Booking CSV with a **status** column and a **start date** column (date and time together, or a
  separate time column). `Client`/`Email`/`First Name`+`Last Name`, `Service`, `Price`, a
  booked-on column (`Created`, `Booked On`) and a cancelled-at column are used when present.
- Typed: late-cancel notice window (default 24 h), a default price for rows with none (a
  **placeholder**), the repeat-offender threshold, and the deposit what-if (fee %, share of
  no-shows prevented, share of fees collected).

**Column names and status words are matched by alias and unverified against real Square
Appointments, Acuity, Calendly, Vagaro, Fresha or Booksy exports.** Status aliases: no show /
no-show / missed / did not attend; cancelled / canceled; completed / attended / checked out.
Comma, semicolon, tab and pipe files, UTF-8 BOM and UTF-16, quoted fields, ISO and month/day/year
or day/month/year dates with 12- or 24-hour times, and duplicate rows are handled; skipped rows are
listed with the reason.

## Model

Counted bookings are attended, no-show and client-cancelled; bookings cancelled by the business
and still-open bookings are left out of every rate. Late cancel = client cancellation less than the
notice window before the start (needs a cancelled-at date; otherwise counted as a cancellation of
unknown notice). Revenue lost = price of each no-show; late-cancel revenue is shown apart as at
risk. Rows with no price use their service's average from the file, else the typed placeholder.
Groups under 5 bookings are marked as small samples. The deposit what-if treats prevented
no-shows as kept visits and charges the fee percentage on the rest; every input to it is the
user's assumption, not a forecast. Not modelled: clients lost to a fee, refunds and processing
fees, rebooked slots, overbooking, and local limits on fees.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output before relying on it**,
and before changing a booking policy or charging a fee. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

Independent of and not affiliated with Square, Acuity, Calendly, Vagaro, Fresha or Booksy.

**Privacy.** Nothing is uploaded; client names stay in the browser. Anonymous feature counts
(`csv_analyzed`, `example_loaded`, `report_downloaded`) are kept only in local storage, can be
switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
