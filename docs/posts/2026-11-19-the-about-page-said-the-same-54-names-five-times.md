---
title: "The About page listed the same 54 tools five times"
seo_title: "Which free tools send your data to an outside service: one list"
date: 2026-11-19
tags: [site-design, polish, privacy, mobile]
description: "/about/ was 19,771 px tall on a phone, half of it one list of 54 tool names pasted in five places. It now appears once, and the page is a third shorter."
---

`/about/` is the fourth most-loaded page on the site. It answers the question a careful visitor asks before typing their costs into a stranger's calculator: *where do my numbers go?* The answer is "nowhere" for most of the 1,405 tools, and "to a service you chose" for 54 of them, such as an AI model you connect, a payment account, or a public DNS resolver.

**What looked weak.** On a 390 px phone the page was 19,771 px tall. Its privacy section alone took 9,800 px. The reason was not the explanation itself. Every sentence that mentioned the exceptions had the whole list of 54 tool names pasted into the middle of it:

- "Nothing you enter is transmitted … except *[54 names]*, which call an outside service"
- "Besides the live API calls *[54 names]* make, the only outside addresses …"
- "It works offline … except *[54 names]*, whose whole point is a live lookup"
- in the press kit: "*[54 names]* are the documented exceptions"
- and once more in a fold-out box under the heading.

That is about 1,900 words of repeated links. The page was built when there were one or two exceptions. Back then, naming them inline was the clearest thing to do, and the template kept doing it as the count grew.

**What changed.** The 54 tools now appear once, in a list under the privacy panel headed "The 54 tools that call an outside service". The list runs in two columns on a laptop and one on a phone. Below it is a single line naming every host those tools can contact. With three or fewer exceptions the old inline wording comes back, because a short list still reads best inside the sentence. All four sentences now link to the list. A new test fails if any of those tools is linked more than once in the page's main column.

**Measured** (Chromium, the built page):

| | Before | After |
|---|---:|---:|
| Page height at 390 px | 19,771 px | 13,138 px (−34%) |
| Page height at 1280 px | 10,126 px | 7,531 px (−26%) |
| Privacy section at 390 px | 9,790 px | 5,226 px |
| Words in the main column | ~3,550 | 1,870 |
| Sideways scroll at 390 px | none | none |

**One honest caveat stays on the page.** The host list is read from each tool's code when the site is built. It deliberately names too much rather than too little. For example, it lists `x`, `h.example` and `proxy.local`, which are placeholder base addresses in server code that never makes a request. The page now says so in plain words. Removing them from the scanner is a separate job, because one of those tools could then lose its disclosure entirely.
