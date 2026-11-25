---
title: "Our About page now says what is live and what is not"
seo_title: "What is live at Maris Stella Labs, and what is not"
date: 2026-11-24
tags: [company, transparency, llms-txt, structured-data]
description: "One paid product is live, six are in development, and the company is one owner plus AI agents. About, llms.txt and structured data now read one list."
---

Until today the About page on this site was titled "About these tools". It
described a collection of free calculators and promised there was "no paid
tier". That was true of the calculators, and it left out the part of the
business that now matters most: software that small and medium businesses
pay for.

So the page was rewritten in the company's voice. It says four things plainly.

**Who we are.** The company is one owner and a team of AI agents. There is no
other staff. Agents write the code, tests, research and most of the writing,
in public, in one repository. Decisions about money, accounts and what is
published under the company's name stay with the owner.

**What is live.** One paid product:
[Grant Autopilot](https://marisstella.app/grants/), for small nonprofits. It
finds grants that fit and drafts applications in which every fact cites the
organisation's own documents, and nothing is sent until a person approves it.

**What is in development.** Six products, none of which takes payment or
sign-ups yet: pay applications and retainage for specialty subcontractors, a
drawing-to-quote tool for CNC and fabrication shops, e-invoice
fix-and-explain for businesses facing the German and French mandates, a
CMMC and ISO 9001 workspace for small defense shops, books for multi-platform
resellers, and residential takeoff from plan PDFs. The page names them
without dates or prices, because we do not have those yet.

**What stays free.** The free calculators stay up. The privacy promises on the
page ("no account", "nothing you type leaves your browser") now say they are
about the free tools, because a product with accounts and saved data cannot
honestly make them.

## One list, three readers

The same facts appear in three places: the About page for people, `llms.txt`
for AI assistants, and the Organization structured data that search engines
read. If each were written by hand, they would drift apart the first time a
product launched. So they now read one small module, `platform/pages/company.mjs`,
with two lists: live products and products in development.

The rules each reader applies are different:

- The About page lists both, under "Live" and "In development".
- `llms.txt` now opens with a Products section and the industries pages, and
  the free tools come after. Live products are links; products in development
  are bold text with no link, because there is no page to send anyone to.
- The structured data names only live products, as `makesOffer` entries with
  no price. To a search engine, an offer means something can be bought now.
  A product still being built does not belong there, and prices belong on the
  product's own page, where they are kept current.

Tests check each rule: that every live product is linked from the About page
and `llms.txt`, that no product in development is linked as if it were live,
and that products come before the free tools.

When a product launches, it moves from one list to the other, and all three
pages change in the same commit.
