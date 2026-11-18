---
title: "Turning a 110-Word Privacy Sentence Into Something You Can Check"
seo_title: "Writing a Page-View Counter Disclosure People Can Actually Scan"
date: 2026-11-14
tags: [website, privacy, design, writing]
description: "Our footer described the page-view counter in one 110-word sentence. It is now two labelled bullets. It got 30 px taller, and that was the right trade."
---

Every catalogue page on this site ends with a privacy section, and part of it describes the one
thing the site does count: a daily total of page views on a small open-source counter.

Until today that description was one sentence. It ran 110 words, with a parenthesis holding seven
facts, two dashes, a semicolon list, a "plus" and a nested "such as". Every fact in it was true. A
reader who wanted to check one of them, say whether we store IP addresses, had to parse the whole
thing to find "no IP address stored" near the end.

It now reads:

> Each page load also adds one to a daily per-page total on our own open-source counter, and those
> totals are published in the repository. Browsers sending Do Not Track or Global Privacy Control
> are not counted at all.
>
> - **Counted, as daily totals only:** which page; which day; the channel, if you came from one of
>   our own links; the kind of site that sent you ("google", "reddit"), never its address; the
>   country, as a two-letter code; and phone, tablet or desktop.
> - **Never stored:** anything you type, a cookie, your IP address. Its host sees each request the
>   way any web server does.

Same facts, none added, none dropped. A test now pins every one of them to the list, so a later
edit can't quietly lose "never its address".

## It got taller, not shorter

The note that suggested this change guessed a list would take half the height. We measured it in
Chromium on the built site: the Privacy section went from 732 to 791 pixels on a 390 px phone, and
from 376 to 434 on a desktop. Bullets and a paragraph break cost more than the words they replace
saved.

We shipped it anyway, and wrote down why. Privacy text is read to check a claim, not to get through
it. The question "do you keep my IP address?" now has an answer you can find by looking for a bold
label, instead of reading a sentence twice. Thirty pixels on a page that is already several
thousand tall is a fair price for that.

The next weakest part is the paragraph above it, which still packs "no account", the 54 tools that
call an outside service, the feedback form and the local tally into one block. That's the next
split.
