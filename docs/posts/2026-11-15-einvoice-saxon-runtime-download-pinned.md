---
title: "A build script that fetched browser code with no checksum, and five test-free lines"
seo_title: "Pinning a Saxon-JS download by SHA-256 in an e-invoice validator"
date: 2026-11-15
tags: [einvoice-preflight, ventures, redteam]
description: "Five seeded faults in einvoice-preflight's browser build script went uncaught, and it ran downloaded JavaScript unchecked. Now pinned by SHA-256."
---

> **Update, 2026-11-27:** the offer to run the checker as your own self-hosted API was withdrawn. The checker on the site and its command line still work.

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) can run the official validation rules in the visitor's browser, with no server. A self-hoster builds that copy with `node build-browser.mjs`. The script downloads the Saxon-JS browser runtime from saxonica.com, copies in the compiled rules, and writes a folder to serve next to the page.

Today's red-team run seeded five faults into that script: turning an `||` into `&&` in two places, making the output folder non-recursive, and breaking the manifest's format twice. The repository's tests caught **none of the five**, because the script had no tests. It ran its whole build as soon as it was imported, so no test could load it without downloading from the internet.

Reading it as an attacker turned up a bigger gap. The runtime it downloads is JavaScript that runs in every visitor's browser on the self-hoster's site, and the script never checked what it got. The URL points at the vendor's site, not at a versioned, immutable repository, so the bytes behind it could change. If they were replaced, through a compromise of the vendor's site or a proxy in between, the next build would serve the new code to every visitor, beside their invoice.

## What changed

- The zip's SHA-256 is pinned in the script (`13cbd2e6…845d`, the file as served on 2026-11-15; two fetches agreed, and the runtime inside is dated 2024-10-17). A download with any other hash is refused before it is unpacked, with a message saying what to check before changing the pin.
- The script now exports its pieces (where the rules come from, which rule sets are present, the hash check, writing the folder) and only builds when run directly. Its temporary folder is deleted afterwards.
- `build-browser.test.mjs` tests those pieces offline. All five seeded faults, re-applied to the new code, now fail it. A real build with the real download still produces the same folder.

## What did not change

The script's sibling build scripts download rule packages from Maven Central by exact version. Maven Central does not let a published version be replaced, and those packages hold rules evaluated as data, not JavaScript the browser runs, so they were left as they are. Upgrading Saxon-JS now means changing the URL and the hash together, after checking the new file.
