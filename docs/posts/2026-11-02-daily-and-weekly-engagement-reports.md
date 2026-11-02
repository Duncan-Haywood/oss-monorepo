---
title: "Daily and weekly engagement reports, and what the first ten days say"
seo_title: "Engagement reports for a free tool site: the first ten days"
date: 2026-11-02
tags: [measurement, usage, privacy, platform]
description: A script now turns the site's cookieless page-load counts into daily and weekly reports. The first ten days show 95 page loads, one tool opened on three separate days, and about 450 crawler beacons for every page load.
---

The site at [marisstella.app](https://marisstella.app/) has counted its own page loads since 2026-10-24. Its beacon is cookieless and stores no IP address or browser string, and a browser that sends Do Not Track or Global Privacy Control is not counted. A daily job copies those counts into the repository as JSON. Until today, getting an answer out of that file meant doing the sums by hand each time.

`platform/counter/engagement-report.mjs` does the sums now. For each day, and for each Monday-to-Sunday week, it writes a short Markdown report:

- page loads, with the day or week before for comparison;
- the pages, ranked, split into tools, category pages and site pages;
- **tools opened on two or more days**. The beacon sets no identifier, so it can't count returning visitors. A tool that gets loads on separate days is the nearest anonymous signal;
- pages loaded for the first time;
- country, device and referring-site splits;
- crawler beacons, kept separate and never added to page loads;
- messages from the feedback form, shown as plain code so a stranger's text can't render a link;
- GitHub repository traffic and Cloudflare edge numbers, once those pulls have the tokens they need.

The script calls no network service and adds no data. It reads only the files that are already public in the repository.

## The first ten days

From 2026-10-24 to 2026-11-02 (the last day is still in progress):

| Week | Page loads | Loads on tool pages | Tools opened |
|---|---:|---:|---:|
| 2026-W43 (data from Oct 24) | 13 | 3 | 1 |
| 2026-W44 | 70 | 21 | 8 |
| 2026-W45 (one day so far) | 12 | 4 | 1 |

That makes **95 page loads in ten days**. Most of them were on the catalogue browse page (27), the shed designer (18), the ask page (18) and the about page (15). Of the 54 loads that carry a country, 52 came from the US, one from Poland and one from Cameroon. All but one came from a desktop browser. Eleven arrived from another site: ten from a site the beacon files as "other" and one from GitHub. No load came through a tagged channel link.

The shed designer is the only tool opened on more than one day: 7 loads on Oct 30, 7 on Nov 1 and 4 on Nov 2. The counts can't say whether that's one person returning, several people, or someone from this project testing it. They do say it's the tool to watch.

The feedback form has received one message, and that was our own test.

## Crawlers outnumber people

On Oct 30 the beacon started counting crawlers that run JavaScript, and it keeps them apart from page loads. In the four days since, it recorded **29,251 headless-browser beacons** and 17 from Yandex, against 65 page loads. That's about 450 crawler beacons for every page load. Without that split, a raw request count would make this site look busy.

## A pipe that had quietly stopped

Writing the reports turned up a problem: the daily job that copies the counts into the repository had failed on Oct 31 and Nov 1. `main` now accepts changes only through a pull request, and the job was pushing to it directly. The counts were safe on the counting server, so nothing was lost; this post's numbers were pulled from it by hand.

The fix sends the job's output, reports included, to a data branch called `usage-data`, which never merges into `main`. That's how the security-alert queue already works. Because the fix changes a workflow file, it waits for the owner's approval. After that, a new set of reports lands every morning, and the latest is one command away:

```
git fetch --depth=1 origin usage-data && git show origin/usage-data:reports/README.md
```
