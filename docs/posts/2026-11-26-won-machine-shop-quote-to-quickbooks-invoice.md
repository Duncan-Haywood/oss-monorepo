---
title: "From a won machine-shop quote to a QuickBooks invoice without retyping it"
seo_title: "Machine shop quote to QuickBooks Online invoice"
date: 2026-11-26
tags: [jobshop-quote, for-customers, quickbooks, cnc, invoicing, ventures]
description: "Job shops retype won quotes into QuickBooks. What goes wrong (quantity breaks, the PO, currency) and how Job Shop Quote sends the invoice at the quoted prices."
---

*Written by an AI agent working in this repository.*

In most small CNC and fabrication shops, the quote lives in one place and the books in another.
The estimator prices the job in a spreadsheet or a quoting tool. The customer sends a PO. Then
someone types it all into QuickBooks Online: the customer, every part, the quantity ordered, the
price, and the PO number. It is a few minutes per job, and it is where wrong invoices start.

## Where the retyping goes wrong

- **Quantity breaks.** A part quoted at 10, 50 and 100 has three unit prices. The PO says 50, and
  the invoice needs the 50-piece price. A price typed from memory, or from the wrong row, is a
  short-paid invoice or an awkward call with the customer.
- **Parts the customer did not order.** An RFQ for four parts often ends in a PO for two. When the
  whole quote is copied over, the other two have to be deleted by hand.
- **The PO number.** Many customers' accounts payable teams will not match an invoice without
  their PO on it. In QuickBooks Online it has to go in a field the customer can see, such as the
  message displayed on the invoice, not in a private memo.
- **The customer record.** "Acme Robotics", "Acme Robotics LLC" and "ACME" become three customers,
  and the sales-by-customer report stops meaning anything.
- **Currency.** A shop that quotes in Canadian dollars, with books in Canadian dollars, is fine.
  A quote in one currency typed into books kept in another is wrong without any warning.

## What Job Shop Quote does

[Job Shop Quote](https://marisstella.app/industries/manufacturing/) turns an RFQ (the email, the drawings, the STEP or DXF
file) into a priced quote from your own rate card. Once a quote is won, its page has a
**Send to QuickBooks** card:

1. An owner or admin connects your QuickBooks Online company once, on the rate card page,
   through Intuit's own sign-in. The app never sees your QuickBooks password. The access Intuit
   grants is stored encrypted for your shop only, and **Disconnect** revokes it.
2. For each part, you pick the quantity ordered from the **quantities you quoted**. If the
   customer accepted the quote online, their choices are already filled in, and the parts they
   did not order are left off. A part quoted at a single quantity needs no pick. A quantity you
   never quoted cannot be sent, because the app never makes up a price between your breaks.
3. One click creates the invoice in QuickBooks. Its number follows the quote (`Q1001`, or
   `Q1001-R2` for a revision). It has one line per part (`BRK-114 Rev C, Mounting bracket`) with
   the quantity, unit price and amount exactly as quoted. "Your PO 4500123. Per our quote Q-1001."
   is printed on the invoice.

A few guardrails come with it:

- **Your customers are not edited.** If QuickBooks already has a customer with that name, the
  invoice goes to it unchanged. Otherwise a new customer is created.
- **One invoice per quote.** A second click says the quote is already in QuickBooks. If the
  connection drops after QuickBooks created the invoice, pressing the button again returns the
  same invoice instead of making a duplicate.
- **Nothing internal leaves.** QuickBooks gets the customer, the part numbers, descriptions,
  quantities and prices. Your machine rates, costs, markups and routings stay in the app.
- **Currencies must match.** If your shop prices in euros and your QuickBooks company keeps its
  books in dollars, the send is refused before anything is written.

Lines go in under one item, "Machined parts". The app creates it the first time if your company
does not have it. Sales tax follows your customer's settings in QuickBooks, as it does for any
invoice you create there. Choosing your own item and income account, and class or location for
QuickBooks Plus and Advanced, is the next step.

## Status

The QuickBooks connection is built and tested. It turns on when Job Shop Quote opens to shops, and
during early access it is included on every plan. If your shop quotes in a spreadsheet today and
invoices in QuickBooks Online, this is the step that turns a won quote into a sent invoice.
The job traveler for the floor, printed from the same won quote, is the other. To check a quote's
numbers before you send it, the free [job-shop quote calculator](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator)
works without an account.

*Job Shop Quote produces estimates from the rates you enter. Check every quote and invoice before
you send it; nothing here is accounting or tax advice.*
