# T&M tickets

Time-and-material tickets for extra work (`/orgs/:orgId/projects/:projectId/tm-tickets`, every plan,
linked from the job page). Rules in `src/shared/tm-tickets.ts`, storage in `tm_tickets` (migration
0063), service `src/worker/services/payapps/tm-tickets.ts`, routes `src/worker/routes/org/tm-tickets.ts`,
PDF and CSV `src/worker/services/export/tm-ticket-export.ts`, page `src/client/pages/tm-tickets.tsx`.

## Why

When a GC's superintendent asks a sub for work outside the contract, the sub's money depends on a
ticket written up that day and signed on site, then priced and submitted as a change order before the
subcontract's deadline. Paper tickets get lost in trucks, go unsigned, or are never priced, and extra work with no
signed ticket behind it is hard to get paid for. Field and change-order tools for
contractors commonly carry a T&M module; no competitor page was read for this part, so nothing here
compares against one.

## What a ticket holds

- A number per job (the next free one, or a paper ticket book's printed number), the date of the work
  (at most tomorrow in UTC), the work done, the location, who directed it and a reference (the GC's field
  directive, an RFI number).
- Labor lines (trade, workers, hours each in quarter hours, rate per man-hour), material lines
  (description, quantity to three decimals, unit, cost per unit) and equipment lines (description, hours,
  rate per hour), up to 40 of each. A rate left blank is "priced later".
- Markups for labor, material and equipment (0-100%, basis points), each on its own section's subtotal.
  A new ticket starts with the latest ticket's markups, since the subcontract fixes them.
- Line amounts round half up to the cent (`laborCents` etc.); the total exists only once every line is
  priced (`priceTicket`), otherwise the page shows what is priced so far and how many lines are not.
- "Fill blank rates from this job's tickets" copies the latest rate used for the same trade, material or
  equipment name (`ratesFromTickets`, case and edge spaces ignored); nothing is filled without the click.

## The signature, and what it locks

- `PUT .../:ticketId/signature` records the GC representative's name, title and date (not before the
  work, not after tomorrow UTC) and, when they sign on the device, the drawn signature: the page's
  canvas exports a baseline JPEG (base64, at most 150,000 characters and 1600 px a side, checked by
  reading its start-of-frame marker, `jpegInfo`). Without a drawing it is "signed on paper", and the PDF
  says the signed original is kept by the contractor.
- The GC signs for the quantities, not the prices. Once signed, a change to the date, the work, the
  location or any quantity is refused (409) until the signature is taken off (`DELETE .../signature`,
  which deletes the image too); rates, markups, who directed it, the reference and notes still change
  (`signedFactsKey` is the comparison).
- `GET .../:ticketId/signature.jpg` serves the image to members only (`no-store`, `nosniff`, a
  `default-src 'none'` CSP).

## Billing on a change order

- `POST .../tm-tickets/change-order` with ticket ids (up to 50), a change order number and either an
  existing schedule-of-values line or a new line's item number. Every ticket must be signed, fully
  priced and on no change order; the change order is created by the same `createChangeOrder` the job
  page uses, pending, for the tickets' total, described as "T&M tickets 4, 9: <first ticket's work>
  and other extra work" (500 characters at most), and written to the job history.
- A ticket on a change order is billed: only its notes change, and it cannot be unsigned or deleted.
  Deleting the change order (on the job page) puts its tickets back to signed (`ON DELETE SET NULL`).
- Stages are read, never stored: not signed, signed and not on a change order, on a pending change
  order, change order approved, change order rejected (`ticketStage`).
- The log's headline is the signed work not yet on a change order: its count, its priced total, how
  many of those are unpriced, and the oldest one's work date, since subcontracts set deadlines for
  submitting extra work.

## Downloads

- `GET .../:ticketId/ticket.pdf`: the priced copy (rates, amounts, markups, total) with the drawn
  signature. `?prices=0` is the field copy: quantities only, with blank signature, name and date lines
  to sign by hand.
- `GET .../change-order/:coId/backup.pdf`: every ticket on that change order, priced, oldest first,
  each on its own page: the backup a GC asks for with the change order.
- `GET .../log.csv`: one row per ticket, oldest first, sections in dollars; formula-looking text is
  neutralised (`csvCell`).
- The PDF writer (`export/pdf.ts`) gained JPEG images for this: a DCTDecode XObject behind
  ASCIIHexDecode, so the file stays ASCII (`pdf-image.test.ts` checks the stream and the xref offsets).

The PDF and the page carry the same note: a signed ticket records what the GC's representative saw go
into the work; it is not an approved change order, and the subcontract says how extra work is
authorized, priced and billed.

## Roles and tenancy

Every member reads and downloads (including the signature image); editors and up write, sign, unsign,
delete and bill. Every query filters by `org_id` and the job; `test/worker/tm-tickets.test.ts` checks
another company gets 404 on every route, including billing its own change order with our ticket's id.

## The job's rate sheet (part 2, 2026-11-26)

- One per job (`tm_rate_sheets`, migration 0066): labor rates per man-hour by trade, equipment rates
  per hour, material costs per unit (with the unit), the labor, material and equipment markups (each
  optional: blank means "not set"), and where the rates come from as typed ("Subcontract Exhibit D,
  through 2027-06-30"). Up to 150 rates of each kind; a name may appear once per kind (case and edge
  spaces ignored, `rateSheetProblem`).
- `PUT .../tm-tickets/rate-sheet` saves it whole (editors and up); `DELETE` removes it; the log
  (`GET .../tm-tickets`) returns it as `rateSheet`, plus `rateSheetDraft`, a first sheet built from
  the latest priced rate per name on the job's tickets (`rateSheetFromTickets`) so a job that already
  has tickets is one click from a sheet.
- A new ticket starts with the sheet's markups where it sets one, otherwise the latest ticket's
  (`startingMarkups`). "Fill blank rates" takes the sheet's rate first, then the latest ticket's for
  names the sheet does not list (`jobRates`); still nothing fills without the click.
- Saving or removing the sheet never reprices a ticket. Instead, a ticket not yet on a change order
  lists each priced line or markup that differs from the sheet ("Labor: Journeyman electrician
  $98.50 a man-hour; the rate sheet says $95.00.", `rateSheetDifferences`), since GCs check T&M
  pricing against the subcontract's rates. A person decides which one is right.

## In the weekly email (part 2, 2026-11-26)

Signed tickets on no change order, across the company's active jobs (not the sample job), are listed
in the weekly "money to chase" email under "Signed T&M tickets to bill", one line per job, oldest work
first, at most 10 jobs (`ticketsToBill`, `tmToBillText`, docs/EMAIL.md). The line gives the ticket
numbers, the priced total, how many are not priced yet and the oldest work date, and links to the
job's T&M page. They are enough on their own to send the email.

## Photos and files, and the job history (part 2, 2026-11-26)

- Files per ticket (`tm_ticket_files`, migration 0072; `services/payapps/tm-ticket-files.ts`): photos
  of the extra work (the default kind), material backup (delivery tickets, receipts, supplier
  invoices), a scan or photo of a paper-signed ticket, and other. Up to 20 per ticket, the same type
  allow-list, 15 MB cap and company storage limit as every other file; objects under
  `orgs/{orgId}/projects/{projectId}/tm-tickets/{ticketId}/`, cleared when the ticket or the job is
  deleted. A file never changes what the GC signed or what a change order bills, so files stay open
  on signed and billed tickets: a photo found later is still evidence.
- `GET|POST .../:ticketId/attachments`, `GET|DELETE .../:ticketId/attachments/:fileId`: every member
  lists and downloads (served as an attachment with nosniff); editors add and delete.
- `GET .../:ticketId/packet.pdf` ("PDF + photos"): the priced ticket, an index, then every file kept
  with it, the paper-signed scan included (on a ticket signed on paper, that scan is the signature).
  `GET .../change-order/:coId/backup-with-files.pdf` ("CO backup + photos"): every ticket on the change
  order, then each ticket's files in ticket order, each named on the index with its ticket ("T&M 3:
  Photo of the extra work").
- The job history (`tmTicketEvents` in `@shared/job-history`, written by the route after the change
  succeeds, never for the sample job): written up, changed (naming the fields, with quantities apart
  from rates, since rates may change after the GC signs and quantities may not; a renumbering and a
  moved work date give both values), signed (name, title, date, drawn or on paper), signature taken
  off, billed on a change order (one row per ticket with its own total), deleted, and each file
  attached or removed. The history CSV's "About" column names the ticket ("T&M 3").
- Tests: `src/shared/job-history-tm.test.ts` (the rows and sentences),
  `test/worker/tm-ticket-files.test.ts` (upload, list, download headers, the count on the log, both
  packets, files on signed and billed tickets, storage, history, roles, tenancy, cleanup).

## Not yet

Copying a rate sheet from another job or a company-wide default, emailing the ticket to the GC for a
remote signature, and a daily report's crew turned into a ticket (ROADMAP "Next").
