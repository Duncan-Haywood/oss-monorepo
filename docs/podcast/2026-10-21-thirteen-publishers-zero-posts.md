---
title: "Thirteen publishers, zero posts"
date: 2026-10-21
description: "Our agents built automated publishing for thirteen kinds of destination. None of it has ever posted. What the audit found, and where bots are welcome."
post: thirteen-publishers-zero-posts
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own post.

This repository holds about thirteen hundred free tools and a stream of research write-ups, and AI coding agents build almost all of it. A day earlier, the repository described a tool that publishes each new item to eighteen platforms. Then the owner asked a reasonable follow-up: are there more ways to get found, maybe platforms that let bots post? Before answering, the agent checked whether the publishing it already had was running. It was not.

The audit was done by an AI coding agent at the owner's request, on the twenty-first of October. It only read logs and fetched public addresses. It changed nothing.

Here is what it found. The repository has thirteen scheduled publishing workflows. They cover Bluesky, Mastodon, dev.to, Hashnode, a hub for Threads, Facebook, Instagram and email, GitHub releases, npm, the tool server, two Python package jobs, Homebrew, a container image, and desktop builds.

Six of them have run, twenty-five times between them. Every one of those runs was a dry run. Each printed the posts it would have made, then a line saying which switch and which credentials were needed to post for real. And GitHub marked every one of those runs a success.

Seven have never run at all. Six are weekly jobs whose first slot has not come around yet. One only runs when someone starts it by hand.

Next, every link they would have posted is dead. The repository was renamed. GitHub Pages does not redirect a renamed repository's path, so the site moved to its new address and serves fine there, but the publishers still copy the old address, which returns a not-found error.

And nothing could have been measured anyway. Each post carries a small tag saying which platform sent the visitor, so a privacy-preserving counter could tell them apart. But the counter has no address configured, so all four hundred and sixty visitor fields in the usage file say never measured.

So the honest status of distribution is this: well built, well tested, switched off, pointing at the wrong address, and unmeasured.

Why did it go unnoticed? Each piece did its job, and nothing checked the whole chain. The workflows were meant to be off by default, because posting under the portfolio's name needs credentials only the owner holds. That was the right default. But green meant ran, not posted. A dry run exits successfully, so a dashboard of check marks looked the same as a working pipeline. And the site build was fixed after the rename, while its copies were not. The publishers, and the package and citation metadata, had copied the old address as a fixed string. A fix touching about thirty-five hundred files had been open as a draft since the twentieth.

The lesson the post draws, for anyone running agents unattended: a feature that needs a person to flip a switch should say it is waiting on a person, loudly, somewhere that person looks. Here it said so only in a log line nobody reads.

What is left, in order, because each step depends on the one before. First, fix the links. That is agent work. Second, add credentials for the four free platforms that allow automated posting: Bluesky, Mastodon, dev.to and Hashnode. That is the owner's job, since the accounts are theirs. Third, give the visit counter somewhere to run, so posts can be compared by what they bring in. Fourth, create the owner's user-site repository, named after the GitHub account. Crawlers read the robots file only at the root of a host, and the sitemap, which lists thirteen hundred and ten tool sitemaps, is currently announced at an address no crawler reads.

After that, the post lists platforms that welcome bots, each free, with automated posting within its rules as of mid twenty twenty-six. The official registry for tool servers, which AI agents use to find tools. A one-line notification to feed readers after each deploy. Nostr, where automated accounts are normal. A Telegram channel. Lemmy, which allows accounts flagged as bots, though each community's own rules still apply. Zenodo, for a citable identifier per research release. And Hugging Face, for datasets and demos.

And where the post says it will not automate: Reddit and Hacker News forbid it, X charges per post, and bot pull requests to curated lists are spam.

None of this is advice for your own setup; it is one repository's audit. The written post, with the links and the file paths, is on the site's Writing page.
