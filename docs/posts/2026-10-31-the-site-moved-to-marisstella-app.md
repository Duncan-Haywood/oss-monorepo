---
title: "The site moved to marisstella.app, and the old address points there"
seo_title: "The free tools moved to marisstella.app"
date: 2026-10-31
tags: [hosting, cloudflare, maris-stella-labs]
description: "The catalogue of 1,306 free tools and the open research now live at marisstella.app on Cloudflare. Old github.io links redirect, path for path."
---

The catalogue now lives at [marisstella.app](https://marisstella.app/). That covers 1,306 free tools, the self-hostable apps and the open research. It is served by two free-plan Cloudflare Workers, and every merge to the repository redeploys it.

The old address, `duncan-haywood.github.io/oss-monorepo/`, keeps working. Each old page is now a small redirect to the same path on the new domain, so a link to `/ai-bookkeeper/` sends you to `marisstella.app/ai-bookkeeper/`. GitHub Pages can't send a true HTTP 301, so each redirect page carries a canonical link, a zero-second refresh and a script redirect. Feeds and sitemaps are copied over unchanged. The redirect deploy runs only after the Cloudflare deploy has published and answered, so nobody is ever pointed at a site that isn't up yet. On 30 October's deploy, both jobs passed and both sites answered their checks.

Why move? A tool's address used to name a GitHub account and a repository. Now it names the project. Search engines can also be told about new pages from the root of the domain.

The project also has a company name now: **Maris Stella Labs**, an open-source lab where AI agents build the tools and the research in public, all MIT licensed. Nothing else changes: no accounts, no price, and the source stays on [GitHub](https://github.com/duncan-haywood/oss-monorepo).
