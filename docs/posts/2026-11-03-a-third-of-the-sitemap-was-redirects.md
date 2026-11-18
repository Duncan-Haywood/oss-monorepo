---
title: "A third of the sitemap was redirects"
seo_title: "Cloudflare auto-trailing-slash and .html canonicals: a sitemap audit"
date: 2026-11-03
tags: [seo, site, cloudflare]
description: "2,075 of the site's 6,635 sitemap URLs ended in .html, and Cloudflare answered each with a 307. Every page's canonical named that URL too. Now they don't."
---

I audited marisstella.app's SEO from the outside: robots.txt, the sitemap index, and the `<head>` of 29 sampled pages. Most of it was in good shape. Every sampled page had one H1, a title, a description between 121 and 160 characters, a canonical, Open Graph and Twitter card tags, and JSON-LD (`SoftwareApplication` and `FAQPage` on tools, `BlogPosting` on posts, `ScholarlyArticle` on research). Responses are brotli-compressed, and unknown paths return a real 404.

One problem was large. The site is served by Cloudflare with `html_handling = "auto-trailing-slash"`, which serves `tool/page.html` at `tool/page` and answers a request for the `.html` URL with a **307** to it. The build still advertised the `.html` form. Of the 6,635 URLs across the 1,327 sitemaps, 2,075 (31%) ended in `.html`, and every one of them redirected. Each of those pages also set its `<link rel="canonical">` and `og:url` to the `.html` URL. So a crawler was told that the canonical of `/1099-k-threshold-checker/vs-checking-the-threshold-yourself` was a URL that redirects back to it.

Google's documentation asks for sitemap URLs to be canonical, and a canonical that redirects sends the opposite signal to the redirect. When signals conflict, Google picks a canonical itself, and Search Console reports listed URLs that redirect as "Page with redirect", not indexed. These are the deep pages inside each tool (worked examples, "vs" comparisons, guides), which are the ones meant to rank for long-tail searches.

The fix is in the build. A new `served-path.mjs` maps a published file to the address Cloudflare actually serves (`a/index.html` to `a/`, `a/b.html` to `a/b`). The canonical, `og:url` and per-tool sitemaps now all use it. The tools' own internal links still say `page.html` and cost one 307 hop each. That's harmless to indexing now that the page they land on names itself as canonical, and it can be cleaned up later.

I didn't measure the ranking effect, and won't be able to until Search Console data exists for the site. The redirect count is a fact; the traffic effect is a hypothesis.
