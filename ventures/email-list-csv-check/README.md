# Email List CSV Check

A free browser tool for small-business owners, shop owners, nonprofits and marketers who move a
contact list into Mailchimp, HubSpot, Klaviyo, Brevo or Constant Contact: **paste or drop the CSV
and see every problem with its line number before the import skips rows or the first campaign
bounces, then download a safe-fixes copy and a separate file of the rows it set aside.** The list
is read in the browser; nothing is uploaded and no login or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/email-list-csv-check/

After using this, you can now **find the address with a space in it, the `gmial.com` and `.con`
typos, the same person listed twice as `Joe@x.com` and `joe@x.com` or `j.o.e@gmail.com`, the
`info@` and `noreply@` mailboxes, the disposable inboxes, the phone numbers Excel turned into
`5.56E+09`, the ZIP codes that lost their zero and the heading the platform will not recognise,
and download a cleaned list plus a rejected-rows file**, which used to mean a failed import and a
scroll through thousands of rows.

## Checks

Email syntax (missing or doubled @, spaces, `Name <address>` form, several addresses in a cell,
bad characters, malformed domain); blank emails; whitespace; duplicates ignoring case; likely
duplicates through Gmail dot and `+tag` aliases; common provider typos with a suggested fix; role
accounts; a small built-in disposable-domain list; byte order mark, delimiter and ragged rows,
scientific notation, stripped leading zeros, `.0` endings, Excel error values and mojibake;
subscription or consent column hints and rows marked unsubscribed; heading names against each
platform's expected names.

## Safe fixes

`repair()` trims, lowercases emails, drops the BOM, writes commas, optionally renames headings to
the chosen platform's names, keeps the first of exact duplicates and, only when asked, fixes typo
domains. Rows with a blank or invalid email, the wrong cell count or an exact duplicate go to a
rejected file with the reason. Alias duplicates, role and disposable addresses are never removed
for you, and no name, phone or other value is rewritten.

## Not covered

It does not verify that an address exists or will not bounce, it does not establish consent
(CAN-SPAM, GDPR, CASL and platform terms are the user's responsibility), and it is not legal
advice. Platform heading names are read from memory of public help pages.

## Run

Open `index.html` through any static server. Tests: `node --test`.
