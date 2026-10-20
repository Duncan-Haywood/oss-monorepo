---
title: "Turning 1,213 static web tools into offline desktop apps with Tauri"
date: 2026-10-20
description: "How we wrap static calculator pages as offline Tauri v2 apps for macOS, Windows and Linux: a 1.4 MB .deb, a CSP that blocks the network, measured numbers."
tags: [distribution, tauri, desktop-apps, offline, open-source]
---

# Turning 1,213 static web tools into offline desktop apps with Tauri

This repository publishes about 1,300 small free tools: calculators, checkers
and planners. Each one is a static web page that already runs entirely in
the browser. The owner asked for them on every platform, not just the web.
We already had packagers for iOS, Android, browser extensions, npm, PyPI and
an MCP server. Desktop was the gap, and this post covers how we closed it and
what we measured.

## Why Tauri and not Electron

Electron ships a full copy of Chromium with every app, so even a "hello world"
installer is tens of megabytes. Tauri v2 uses the operating system's own web
view: WebView2 on Windows, WKWebView on macOS and WebKitGTK on Linux. The
app itself is a small Rust binary. Tauri is MIT/Apache-2.0, which matches
the tools' MIT licence.

We measured one real tool, the shift roster builder, built on Linux:

| Artifact | Size |
|---|---|
| Executable | 3.6 MB |
| `.deb` package | 1.4 MB |
| `.AppImage` | 80 MB |

The AppImage is large because it carries its own WebKitGTK so that it runs on
any distribution. The `.deb` relies on the system copy. That trade-off is
worth knowing before you choose which Linux format to recommend.

## Offline by construction, not by promise

Every tool page already claims "nothing you type is uploaded". A desktop app
should make that claim impossible to break by accident, so the packager
enforces it in four places:

1. **A Content-Security-Policy with `connect-src 'none'`.** Tauri attaches it to
   every bundled page, so `fetch`, `XMLHttpRequest`, WebSockets and beacons
   all fail. `script-src 'self'` also rules out inline and remote scripts.
2. **No Tauri capabilities.** Tauri v2 only lets a page call native commands
   that a capability file grants. We ship no capability file, so the page can
   call no native command.
3. **Navigation stays in the bundle.** The Rust shell checks every
   navigation. A bundled page loads. Anything else, including a link to a
   guide page that isn't bundled, opens in your normal browser.
4. **Pages that need the network are skipped.** We reuse the
   browser-extension packager's checks, which reject a page that calls the
   network, loads remote code or uses inline event handlers. 1,213 of 1,285
   pages pass.

## One trap: Tauri's fallback page

Tauri behaves like a single-page-app server: a request for a missing path
returns the root `index.html`. Our pages link to sibling guides with relative
links such as `../how-to-make-an-employee-schedule/`. In the app those links
would have silently shown the wrong page. The fix was to lay out the bundle
exactly like the website and generate the list of bundled pages into the
Rust shell. A link to any other page then opens the real page on the site,
tagged so we can count those arrivals.

## Suites

A single calculator is a thin app. The packager can also build a whole
catalogue section as one app, with a launcher page listing its tools and an
"All tools" link on each tool. Sections range from 2 tools to 212. The
largest bundles 11 MB of pages.

## What is automated and what is not

A manual-only GitHub Actions workflow builds unsigned `.dmg`, `.msi`, `.exe`,
`.AppImage` and `.deb` files on macOS, Windows and Ubuntu runners. It
attaches them, with checksums and filled-in `winget` manifests, to a
pre-release. It stays off until the owner sets a repository variable, per
the repository's rule against unattended automation.

Code signing, Apple notarisation and the `winget` submission need the owner's
accounts and certificates, so they are documented rather than automated.
Flatpak and Snap are written up as follow-ups. Until the first signed build,
macOS and Windows show a one-time "unverified developer" warning.

What we have not checked yet: the macOS and Windows builds themselves. The
Linux build compiled with no warnings and rendered the tool offline. The other
two operating systems get their first real test on the first workflow run.

The packager is `platform/distribution/desktop.mjs`, and the handoff for the
remaining steps is in `docs/history/desktop-apps-2026-10-20.md`.
