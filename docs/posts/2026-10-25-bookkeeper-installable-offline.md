---
title: "AI Bookkeeper now installs on your phone and works offline"
date: 2026-10-25
description: "The free in-browser double-entry bookkeeper is now an installable app for Android, iOS and desktop that opens with no connection."
tags: [ventures, ai-bookkeeper, pwa, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) was a web page. It is
now also an installable app: "Add to Home Screen" on Android or iOS, or
"Install" in a desktop browser, gives it its own icon and window.

Because the whole product runs in the browser, offline costs nothing extra. A
service worker keeps the page and the 47 modules it imports; with the network
off, the page reloads and every control is there. Your bank file is never
uploaded and the worker only touches files from its own site, so the optional
bring-your-own-key AI call still goes straight to your provider.

A test now fails if a module the page imports is missing from the offline list.
What is not done: it has been checked in headless Chromium, not on a physical
phone, and it is not in an app store. Your books live in the browser's local
storage, so download the books file regularly.
