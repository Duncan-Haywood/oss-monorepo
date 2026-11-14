---
title: "One utility bill flipped every sign in a bank file"
seo_title: "Ally, Wells Fargo and Chase CSV imports: three bugs on real exports"
date: 2026-11-14
description: "ai-bookkeeper read 19 more real US bank exports. A 528-row Ally file came in with every sign backwards, and Stripe payouts at Chase were suggested as transfers."
tags: [ai-bookkeeper, bank-import, verification]
---

The ai-bookkeeper turns a bank's CSV export into double-entry books. A bank's CSV doesn't say which way the money moved in any standard way. Some banks sign the amount, some split it into debit and credit columns, and card issuers often list charges as positive. So the reader works it out. On a file with one amount column and no running balance, it looks for a card-payment row ("PAYMENT THANK YOU", Discover's "DIRECTPAY FULL BALANCE"). If that row is negative, the file must list charges as positive, so every sign gets flipped.

On November 12 we ran the reader on 22 bank and card exports that people had committed to public GitHub repositories. That batch had no Wells Fargo, no Chase checking download and no business account. Today we added 19 more files: Wells Fargo's header-less checking export, Chase checking and card files, Ally, Apple Card, a US Bank-layout card, and a Chase account that an LLC is paid into by Stripe. The files are fetched when the evaluation runs and never copied into the repository.

**Bug 1: one utility payment flipped 528 rows.** This Ally checking export signs its amounts correctly: deposits positive, withdrawals negative, with a Type column that says so. But its owner pays the power company through the utility's bill-pay service, and those rows read `LIPA DIRECTPAY~ Future Amount ...`. The reader treated "directpay" as a card-payment word. Those rows were negative, so it decided the file listed charges as positive and flipped all 528 rows. Payroll became money out. Now "DIRECTPAY" counts only at the start of a description, where Discover puts it. And when a Type column's "Withdrawal" and "Deposit" agree with the signs, the signs are left alone.

**Bug 2: Stripe payouts at Chase looked like transfers.** Chase prints an incoming ACH payment as its raw bank-network record: `ORIG CO NAME:STRIPE ORIG ID:... CO ENTRY DESCR:TRANSFER SEC:CCD TRACE#:...`. The keyword rules saw the word "transfer" and asked which of your other accounts the money came from. The payee memory was worse off. It names a payee by the first two words with no digits in them, so every ACH line at Chase got the payee "orig name". Stripe payouts, payroll and IRS debits would all have been learned as a single payee. The reader now takes the payee from the originator's name and the entry description ("STRIPE TRANSFER", "IRS USATAXPYMT"). Stripe payouts are now suggested as sales, and the card payment and savings transfers on the same file are still transfers.

**Bug 3, a small one:** a Chase file saved back out of pandas has an unnamed index column first, and the reader didn't recognise it as Chase.

**After the fixes:** 41 files, 3,284 rows, the bank named on all 41, and no payment or deposit with the wrong sign. All three bugs are pinned in tests that use rows we wrote ourselves under each bank's real column headers. Still untried: a US Bank checking download, a credit union, and a business account at any bank other than Chase.

The pattern matches the November 12 batch. Column headers we had written from memory were wrong, and every bug came from a real file. A bank export that's off by one sign looks fine until the profit and loss statement comes out upside down.
