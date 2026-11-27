# QuickBooks Online

PayApps sends each sent pay application to QuickBooks Online as an invoice to the general
contractor (Crew plan and up). QuickBooks has no retainage of its own in most companies, so the
invoice uses the pattern in `packages/qbo-sync` ("Retainage pattern"): retainage held is a
negative line on a `Retainage` item that posts to a `Retainage Receivable` asset account, and
retainage released is a positive line on the same item. The account's balance is retainage held
to date.

## What gets written

For a pay application (status submitted, certified or paid):

| Line | Item | Amount |
| --- | --- | --- |
| one per schedule-of-values line with a change | the company's own item when an admin chose one ("Your own item"), else `Contract Billing` (income account `Contract Income`) | what this application adds to column G: work this period plus the change in materials stored |
| retainage | `Retainage` (account `Retainage Receivable`) | line 8 minus the work lines: negative when held, positive when released |

The invoice total is always the application's own line 8 (`src/shared/qbo-invoice.ts`, tested in
`qbo-invoice.test.ts`): the retainage line is the difference, so nothing is recomputed from a rate.
With consistent history it equals minus the change in line 5; the planner reports any gap.

- **Customer:** the job's general contractor by name (`upsertCustomer`; an existing customer with
  that display name is reused).
- **Number:** `PA` + job number + application number, e.g. `PA24-117-03` (at most 21 characters,
  QuickBooks' limit). A retry first looks the number up, so a send that reached QuickBooks but not
  our database is recorded, not duplicated; a different invoice under that number is refused.
- **Dates:** the application date; due date = application date (or the period end, when the job's
  terms count from it) + the job's pay terms when set, the same date the cash report uses. On a
  pay-when-paid job (terms count from the owner's payment to the GC) the due date is that day + the
  terms once it is recorded on the application, or the job's outer limit ("in any event within 90
  days", from the application date) when that is earlier or the owner's payment is not recorded; an
  invoice sent with neither has no due date, and PayApps does not change an invoice already in
  QuickBooks when the date is recorded later.
- **Billing email:** the job's GC billing contact (`gc_billing_email`) as the invoice's own
  `BillEmail`, so "Send" in QuickBooks reaches the GC's accounts payable for that job. It is set on
  the invoice, never on the customer, because jobs for the same GC can bill different contacts. An
  address QuickBooks would refuse (over 100 characters) is left off with a note in the preview
  rather than failing the send; no contact, no billing email, and the preview says how to add one.
- **Sent once:** `qbo_invoice_syncs` keeps one row per pay application. Disconnecting keeps it.
- **Refused:** drafts; a negative line 8 (QuickBooks cannot take a negative invoice; record a credit
  memo there); an application that bills nothing.

## Your own item

Most companies already bill contract work with an item of their own (say "Electrical Labor",
posting to "Construction Income"), and their bookkeeper will not want a second income account
appearing. On the QuickBooks page an admin picks the item the work lines are billed with
(`GET /api/orgs/:orgId/quickbooks/items`, read live from QuickBooks; `PUT .../invoice-item` with
`{ "itemId": "<id>" | null }`). Stored on `qbo_connections` (`invoice_item_id`, `invoice_item_name`,
migration 0017).

- **Offered:** active Service and Non-inventory items that post to an income account
  (`listSaleItems`, `select * from Item where Type IN ('Service', 'NonInventory')`; QuickBooks
  queries return active items only). Checked again on save: the item must exist, be one of those
  types, post to an income account and not be the `Retainage` item (work on it would land in
  Retainage Receivable).
- **Sending:** the item is read again before each invoice (`getItem`). If it was deleted or made
  inactive in QuickBooks, the send stops with a 409 naming it and nothing is written; PayApps never
  falls back to the default on its own, which would post income somewhere the bookkeeper did not
  choose. With the chosen item, `Contract Income` and `Contract Billing` are never created.
- **Null** goes back to the default item. The preview on each pay application names the item.
- **Another company:** item ids belong to one QuickBooks company, so connecting a different one
  (another realm id) clears the choice; reconnecting the same company keeps it.
- Invoices already sent are not changed.

## An item per job

A contractor who bills service work apart from new construction, or a tenant-improvement job to
its own income account, can give one job its own item. Below the company's item on the QuickBooks
page, admins see every job (the sample job left out, closed jobs last) with "The company's item"
selected, and can pick another (`PUT /api/orgs/:orgId/quickbooks/job-items/:projectId` with
`{ "itemId": "<id>" | null }`; the job list comes back as `jobs` on `GET .../quickbooks/items`).
Stored on `projects` (`qbo_item_id`, `qbo_item_name`, `qbo_item_realm_id`, migration 0031).

- **Checked like the company's item:** active Service or Non-inventory, posting to an income
  account, not the `Retainage` item. The sample job is refused (409); a job in another company is
  not found (404).
- **Sending:** the job's item wins over the company's, and is read again before each invoice. If it
  was made inactive, that job's send stops with a 409 naming the job and the item; other jobs keep
  sending. The preview on each pay application names the item the job uses.
- **Null** goes back to the company's item (or the default when the company has none).
- **Another company:** the choice is tied to the QuickBooks company it was made in
  (`qbo_item_realm_id`), so connecting a different one ignores it; reconnecting the same company
  brings it back.
- Invoices already sent are not changed.

## An item per line

One job can carry work that belongs in different income accounts: switchgear sold as equipment,
labor, a design fee. Each job on the QuickBooks page has **Lines**, which opens its
schedule-of-values lines with "The job's item" selected; admins can pick another for any line
(`GET /api/orgs/:orgId/quickbooks/job-items/:projectId/lines`, and
`PUT .../lines/:sovLineId` with `{ "itemId": "<id>" | null }`). The job's row counts the lines that
have their own item (`linesWithOwnItem` on `GET .../quickbooks/items`). Stored on `sov_lines`
(`qbo_item_id`, `qbo_item_name`, `qbo_item_realm_id`, migration 0033).

- **Order:** the line's item, else the job's, else the company's, else the default. Each invoice
  line still bills exactly what the application adds to that line's column G; the retainage line is
  unchanged, so the invoice total is still line 8.
- **Checked like the company's item:** active Service or Non-inventory, posting to an income
  account, not the `Retainage` item. The sample job is refused (409); a line of another job, or a
  job in another company, is not found (404).
- **Sending:** every line item the invoice uses is read again first. If one was made inactive,
  the send stops with a 409 naming the line, the job and the item, and nothing is created; an
  application that bills nothing on that line still sends. When every work line has its own item,
  the job's and company's items are not read at all.
- **Preview:** each work line names its item when it differs from the job's.
- **Another company:** tied to the QuickBooks company it was chosen in, like the job's item.
- Invoices already sent are not changed. A line deleted from the schedule takes its choice with it.

## Payments received

Once the invoice is in QuickBooks, the panel lists each payment recorded on the pay application
(Payments received) with a **Send to QuickBooks** button (editors). Each becomes one QuickBooks
payment from the GC, applied to that invoice: amount, date received as the transaction date, and
the check number or reference as `PaymentRefNum` (first 21 characters). `qbo_payment_syncs` keeps
one row per payment.

- **Balance check first.** Before sending, PayApps reads the invoice and compares its open balance
  with what it expects: the invoice total less the payments it already sent (or marked). If they
  differ, someone entered a payment in QuickBooks directly or changed the invoice, and sending could
  count the money twice, so nothing is sent (409 `quickbooks_balance_mismatch`, both figures in the
  message). A payment larger than the open balance is refused the same way.
- **Already in QuickBooks.** When the bookkeeper entered a check in QuickBooks by hand, **Already in
  QuickBooks** (`?already=1`) records that and sends nothing, so later sends reconcile again.
- **Idempotency key.** Each send carries `requestid`, 32 hex characters derived from the org and
  payment ids (Intuit's Java SDK appends a `requestid` like this to every create,
  `PrepareRequestInterceptor.java`), so a retry of the same payment is the same request to
  QuickBooks. That QuickBooks answers a repeated `requestid` with the first result is Intuit's
  documented behaviour as we understand it but is not yet checked in a sandbox; the balance check
  does not depend on it.
- **Deleting a payment** that is in QuickBooks asks first (409 `payment_in_quickbooks`, then
  `?confirmQuickBooks=1`): PayApps never deletes or voids anything in QuickBooks, so the editor
  deletes it there too. If they don't, the next send is refused by the balance check.
- **Marked paid in full.** "Mark paid in full" asks for the date received and the check number and
  records the balance as one payment, which is then sent like any other. An application marked paid
  without a date shows the amount with no payment behind it on the pay-app page, with a form that
  records it as one payment (`POST .../payments/unrecorded`); until then there is nothing to send.
- **Not sent:** payments on an invoice that is in another QuickBooks
  company than the one connected now.
- **A balance closed short** (backcharge, disputed or written off; `src/shared/payments.ts`) is
  sent as a credit memo when an editor asks (below); until then the invoice keeps that open
  balance in QuickBooks. The balance check counts payments plus a credit applied to the invoice.

### Balance closed short (credit memo)

When the GC pays short and the rest is closed as a backcharge, a dispute or a write-off, the
invoice in QuickBooks still shows that balance open, so the A/R aging there disagrees with the cash
report. On the pay application's QuickBooks panel, **Send as a credit memo** (editors;
`POST .../pay-apps/:payAppId/quickbooks/short-credit`) writes one credit memo to the GC and applies
it to the application's invoice (`sendShortCredit` in `services/quickbooks.ts`, planned by
`src/shared/qbo-credit.ts`). `qbo_credit_memo_syncs` keeps one row per pay application
(migration 0032).

- **Payments first.** Every payment on the application must be in QuickBooks (sent or marked);
  until then the panel says so and the send is refused, so the open balance means one thing.
- **Balance check.** The invoice's open balance must equal its total less the payments sent. The
  credit is then exactly that open balance: the amount closed short, plus, when the GC certified
  less than line 8, a second line for the difference ("Certified by the GC at ..., below the ...
  billed"). Any other figure is a mismatch: 409 `quickbooks_balance_mismatch`, nothing sent; the
  editor checks QuickBooks and, if the credit is already there, presses **Already in QuickBooks**
  (`?already=1`), which records it and sends nothing.
- **What is written.** Number `CR` + the invoice number's tail (`PA24-117-03` becomes
  `CR24-117-03`), date = the day the balance was closed, customer = the invoice's customer, lines on
  the item the job's work lines are billed with (the job's own item, else the company's, else `Contract Billing`), so the
  income billed is reduced where it was booked, with the reason and the note as the description.
  `requestid` keys derived from the org and application ids go with the memo and its application.
- **Applied to this invoice.** PayApps reads the invoice back after creating the memo. If
  QuickBooks applied the credit there itself ("Automatically apply credits"), nothing more is
  sent. If the credit is still unapplied, PayApps applies it with a zero payment that links the
  invoice and the memo. If QuickBooks applied it to another open invoice of the GC, the row records
  `applied: false` and the panel tells the editor to move the credit to this invoice in QuickBooks;
  the balance check then keeps expecting the amount open on this invoice.
- **Retries.** A send that reached QuickBooks but not PayApps finds the memo by its number and
  records it, never a second one; a memo with that number for another customer or amount is
  refused.
- **Reopening** a balance that is in QuickBooks as a credit (reopening it, or deleting a payment of
  an application closed short) asks first (409 `credit_in_quickbooks`, then
  `?confirmQuickBooks=1`) and forgets the row; PayApps never deletes or voids anything in
  QuickBooks, so the editor voids the memo there.
- **Not sent:** the sample job; an invoice in another QuickBooks company than the one connected.
- History: `quickbooks_credit_sent` and `quickbooks_credit_marked` on the application.
- Not yet run against an Intuit sandbox: the credit memo and the zero-payment application
  (`packages/qbo-sync/README.md`, "Not yet verified").

### Sent as soon as recorded (opt-in)

An admin can turn on **Send each payment to QuickBooks as soon as it is recorded** on the QuickBooks
page (`PUT /api/orgs/:orgId/quickbooks/auto-payments {enabled}`, `qbo_connections.auto_send_payments`,
migration 0030; off by default, and off again after a disconnect since that deletes the row). Then
every payment recorded on an application whose invoice is already in QuickBooks (the payment form,
"Mark paid in full" with a date, and recording the money of an application marked paid without one)
goes through the same `sendPayment` as the button, with every check above: plan, same company, open
balance, the requestid key. It never blocks the record: the payment is saved first, and a refusal
comes back as `quickbooksAuto: {sent: false, message}` on the response, shown under the payment form,
and the payment waits in the panel to be sent or marked by hand. A send is logged in the
application's history as `quickbooks_payment_sent`. Applications not yet sent to QuickBooks, and the
sample job, are left alone (`quickbooksAuto: null`). `services/quickbooks.ts`, `autoSendPayment`.

### Not yet in QuickBooks (cash report)

The Cash and retainage page lists every payment recorded on an application whose invoice is
already in QuickBooks that is not itself there yet (not sent, not marked as entered by hand),
oldest first, across the company's jobs: mostly automatic sends QuickBooks refused, which used to
wait unseen on each pay application's page. Any member sees the list
(`GET /api/orgs/:orgId/quickbooks/unsent-payments`, `unsentPayments`); editors get **Send to
QuickBooks** and **Already in QuickBooks** on each row, which call the pay application's own
`POST .../payments/:paymentId/quickbooks` route, so every check above runs again and a refusal shows
its reason. A payment whose invoice is in another QuickBooks company than the one connected now is
listed and flagged, without buttons. The sample job is left out, and the card hides while the
integration is dark or nothing is waiting. Each payment is joined to its invoice, application and
job within the org (`org_id` on every join).

## Connecting

1. An admin presses **Connect QuickBooks** on `/orgs/:orgId/quickbooks`
   (`POST /api/orgs/:orgId/quickbooks/connect`). The server stores the SHA-256 of a random 256-bit
   `state`, bound to that org and that user, for 10 minutes, and returns Intuit's consent URL.
2. Intuit redirects the browser to `GET /api/integrations/quickbooks/callback`. The state row is
   deleted on first use; it must belong to the signed-in user, who must still be an admin of the
   org. The code is exchanged for tokens.
3. Tokens are stored only as AES-256-GCM ciphertext (`lib/token-box.ts`): key from `QBO_TOKEN_KEY`
   via HKDF-SHA-256, a random IV per write, the org id as additional data (a row copied to another
   org does not decrypt). Every refresh saves the newest refresh token (Intuit expires older ones).
4. **Disconnect** (`DELETE /api/orgs/:orgId/quickbooks`) revokes the refresh token at Intuit (best
   effort) and deletes the row.

Errors: an expired or revoked connection answers 409 `quickbooks_reconnect`; a QuickBooks fault
answers 502 (503 when retryable) with Intuit's message and its `intuit_tid` reference.

## Turning it on (owner)

Dark until all five are set; the UI then shows the panels. Tests and the offline demo
(`FAKE_EXTERNALS=true`, never production) use an in-memory fake company instead.

| Name | Kind | Value |
| --- | --- | --- |
| `QBO_CLIENT_ID` | secret | the owner's Intuit developer app (sandbox keys first) |
| `QBO_CLIENT_SECRET` | secret | same app |
| `QBO_TOKEN_KEY` | secret | at least 32 random characters, e.g. `openssl rand -base64 48`; changing it disconnects every company |
| `QBO_REDIRECT_URI` | var | `${APP_URL}/api/integrations/quickbooks/callback`, registered on the Intuit app |
| `QBO_ENVIRONMENT` | var | `sandbox` or `production` |

Before production: connect a sandbox company, send a pay application with stored materials and a
retainage release, and check the invoice and the Retainage Receivable balance in QuickBooks
(`packages/qbo-sync/README.md` lists the API details still to verify against a live sandbox).
Intuit's app review is needed before production keys work for other companies.
