---
title: "A browser bookkeeper that saves to a file you choose, not to our server"
date: 2026-10-25
description: "AI Bookkeeper can now keep a live copy of your books in a file you choose, such as a synced folder, with no account and no upload."
tags: [bookkeeping, privacy, ai-bookkeeper]
---

AI Bookkeeper keeps books in your browser. That is private, and it is also fragile: clearing site data deletes them,
and "remember to download the file" is a chore people skip. The page now offers a live copy in a file you pick.
Choose one in a synced folder (iCloud Drive, Dropbox, OneDrive, Google Drive) and every change is written to it as
you work, with no account and no upload. The same books are then on your other computer.

It uses the browser's File System Access API, so it works in Chrome, Edge and Opera; Firefox and Safari keep the
download button. Writes are debounced, never overlap, and go through the browser's swap-file commit, so a crash
mid-write leaves the previous file whole. A picked file that is not a books file is refused, and memory that is not a
books file is never written over yours. Nine tests cover that; headless Chromium with a stubbed picker confirmed the
wiring. Not tried: a real synced folder, two devices editing at once (last write wins), or a phone.

Code: `ventures/ai-bookkeeper/livefile.mjs`.
