# QuickBooks Online

A won quote goes to the shop's QuickBooks Online company as an invoice in one click: the customer,
each part at the quantity it was quoted at and that quantity's price, and the customer's PO printed
on the invoice. It is on every plan while the product is in early access, and dark until the owner
sets the Intuit keys (below).

Code: `src/shared/qbo-invoice.ts` (what the invoice says, pure), `src/worker/services/quickbooks.ts`
(connect, disconnect, send), `src/worker/ports/accounting.ts` (real, fake or none),
`packages/qbo-sync` (the QuickBooks Online API and Intuit OAuth, shared with payapps),
`src/client/routes/quickbooks.tsx` (the rate card's QuickBooks card and the won quote's card).
Tests: `src/shared/qbo-invoice.test.ts`, `test/worker/quickbooks.test.ts`.

## Connecting

An owner or admin presses **Connect QuickBooks** on the rate card page. The app stores a single-use
OAuth state (its SHA-256 only), bound to that admin and the shop, valid 10 minutes, and sends the
browser to Intuit. Intuit redirects to `/api/integrations/quickbooks/callback`; the state must be one
the same signed-in user started for a shop they still administer. Intuit's tokens are stored
AES-GCM sealed under `QBO_TOKEN_KEY` and bound to the shop's id (`src/worker/lib/token-box.ts`), so a
row copied to another shop does not decrypt. **Disconnect** revokes the tokens at Intuit (best effort)
and deletes them; the record of invoices already sent stays.

## Sending a won quote

On a won quote's page, the QuickBooks card lists each part with its quoted breaks. The quantity per
part is, in order: the one the estimator picks; else the break the customer accepted online (a part
they did not order is left off); else the line's only break. A part quoted at several breaks with
none of these must be picked. "Not ordered" leaves a part off. An estimator sends; a viewer sees
what would be sent.

What the invoice says (`planQuoteInvoice`, `invoiceMemo`):

- **Number:** `Q1001`, or `Q1001-R2` for Rev 2 (QuickBooks allows 21 characters).
- **Customer:** the quote's customer company, matched by display name. One the books already have is
  used as it is and never edited; a new one is created with that name.
- **Lines:** one per part, the shop's chosen item (below), else **Machined parts** (NonInventory, posting to the income account
  **Sales of Product Income**, QuickBooks' own default for product sales; both are found by name and
  created only if missing), description `BRK-114 Rev C, Mounting bracket` as the PDF names the part,
  quantity, unit price and amount from the quoted break exactly. A quantity that was not quoted is
  refused, never priced between breaks (the no-invented-prices rule of ARCHITECTURE.md).
- **Message on the invoice** (`CustomerMemo`): `Your PO 4500123. Per our quote Q-1001 Rev 2.`
- **Date:** today in the shop's time zone. No due date: QuickBooks applies the customer's terms.
- **Private note:** `From Job Shop Quote: Q1001.`
- Nothing internal: no costs, rates, markups, operations or notes.

### Once, and safe to retry

- A row in `qbo_quote_invoices` (one per quote) records the invoice; a second send answers 409
  "Already in QuickBooks as invoice Q1001".
- The create carries a QuickBooks `requestid` derived from the shop and quote, so a send whose
  response was lost and is pressed again gets the same invoice back, not a second one.
- If QuickBooks already has an invoice with the quote's number (sent before the response was lost,
  or typed by hand), it is reused only when its total is what this send would bill; a different
  total is refused with the number named, so the bookkeeper decides.

### Currency

The shop's currency (rate card) must be the QuickBooks company's home currency (read from the
company's preferences, `CurrencyPrefs.HomeCurrency`). A mismatch is refused before anything is
written, since the amounts would land in the company's currency. If a company's preferences do not
say, a US-dollar shop may send and any other is refused.

### Errors

An expired or revoked connection answers 409 "QuickBooks needs to be connected again"; a refusal by
QuickBooks answers 502 with QuickBooks' message; nothing is recorded as sent unless QuickBooks
returned the invoice. Logs carry ids only (shop, quote, invoice), never names, PO numbers or amounts.

## The invoice item

By default every line goes in under **Machined parts** posting to **Sales of Product Income**. A
shop that already books its sales its own way (a "CNC machining" service item posting to
"Machining Income", say) chooses that item instead: an owner or admin presses **Choose the invoice
item** on the QuickBooks card, and the list is read live from the company (its active Service and
Non-inventory items that post to an income account, with the account named). The choice is saved
on the connection, tied to the company it was chosen in: connecting a different company goes back
to the default. Choosing the default again forgets it.

- On save, an item that is not in the company, inactive, or not a Service or Non-inventory item
  posting to an income account is refused (400) with its name.
- At send, the item is read again; one made inactive since refuses the send (409), nothing written,
  and the admin chooses another. Neither "Machined parts" nor its account is created for a shop
  that chose its own.
- API: `GET /quickbooks/items` → `QuickBooksItemsDto`, `PUT /quickbooks/item` `{ itemId | null }`
  (admins; a viewer or estimator gets 403). The status (`GET /quickbooks`) names the item in use.

## Turning it on (owner)

1. Create an app at developer.intuit.com with the `com.intuit.quickbooks.accounting` scope and the
   redirect URI `<APP_URL>/api/integrations/quickbooks/callback`.
2. Set the GitHub secrets `JOBSHOP_QBO_CLIENT_ID`, `JOBSHOP_QBO_CLIENT_SECRET` and
   `JOBSHOP_QBO_TOKEN_KEY` (32+ random characters), and the variable `JOBSHOP_QBO_ENVIRONMENT`
   (`sandbox` until Intuit approves the app for production). The deploy copies them to the Worker
   and sets `QBO_REDIRECT_URI` (docs/DEPLOY.md). Without all five the cards say "not available yet".
3. Intuit's production review asks for the app's privacy policy and terms URLs (the app's
   `/legal/privacy` and `/legal/terms`).

Locally and in tests (`APP_ENV=test` or `FAKE_EXTERNALS=true`, never production) the fake gateway's
"consent page" is the callback itself and the books are an in-memory `FakeAccountingSync`.

## Not yet

- An item per part or part family (the shop-level item is done, above).
- Sales tax: QuickBooks applies the customer's tax settings to the invoice as for any invoice
  created there; the quote itself carries no tax. Check the first real invoices.
- An estimate (instead of an invoice) at send time, and a payment or deposit back from QuickBooks.
- Class and location (QuickBooks Plus and Advanced).
