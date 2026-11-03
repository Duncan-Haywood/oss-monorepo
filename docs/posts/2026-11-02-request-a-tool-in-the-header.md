---
title: Asking for a tool is now one click from any page
date: 2026-11-02
tags: [site, custom-development, requests]
description: The site header now carries a "Request a tool" link to the open custom development page, where anyone can ask for a new product or a feature.
---

Every page on the site now has a **Request a tool** link in the top bar, between Ask and Deploy your own. It goes to the [open custom development](https://marisstella.app/custom-development/) page.

That page has existed since late October, but the only way to reach it was a link in the footer. Most visitors never scroll that far, so a reader who wanted something built had no obvious place to ask.

What the page offers is unchanged:

- **Ask for a new product or a feature** on an existing one. Use a GitHub issue form, or the no-account feedback form with "An idea" picked.
- **Follow the request.** Each one gets an ID and a status in a public table that is rebuilt on every merge. A declined request says why.
- **One condition.** What is built is free and stays MIT licensed, held by the repository owner. There is no promised date and no promise that a request will be accepted.

The link is defined once in `platform/pages/site-nav.mjs`, so the hub, the blog, research pages and every product page get it from the same place.
