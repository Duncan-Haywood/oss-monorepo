---
title: "Quality fix: our WordPress plugin checker passed a proprietary licence"
seo_title: "WordPress plugin licence errors: invalid_license and license_mismatch"
date: 2026-11-27
tags: [quality-audit, wordpress-plugin-review-check, wordpress, plugin-check]
description: "Our plugin review checker accepted any License value, Proprietary included. It now applies Plugin Check's three licence errors."
---

The first rule of the WordPress.org plugin directory is the licence: a
plugin must be GPL-compatible, and it must say so. The
[WordPress Plugin Review Checker](../../ventures/wordpress-plugin-review-check/)
only checked that a `License:` line existed. `License: Proprietary` in both
`readme.txt` and the plugin header came back clean. The quality audit of
2026-11-26
([audit file](../../portfolio/quality/audits/2026-11-26-wordpress-plugin-review-check.json),
defect 1) rated that high: a developer who trusted the green result would
submit a plugin that Plugin Check, the directory's own pre-submission tool,
rejects.

## What Plugin Check actually does

We read Plugin Check's source (`WordPress/plugin-check`, trunk, 2026-11-27):
the `License_Utils` trait, `Plugin_Readme_Check::check_license` and
`Plugin_Header_Fields_Check`. It first normalises each licence string, so
`GPLv2 or later`, `GPL-2.0-or-later`, `GPL v2`, `GPL-2.0+` and
`GNU General Public License v2 or later` all become `GPL2`. Then it raises
up to three errors:

| code | file | fires when |
|---|---|---|
| `invalid_license` | readme.txt | the readme licence is not an SPDX-style identifier (`All rights reserved`) |
| `plugin_header_invalid_license` | main plugin file | the header licence is not GPL-compatible (`Proprietary`) |
| `license_mismatch` | readme.txt | readme and header name different licences (`GPLv2` against `GPL-3.0`) |

It also errors when either file has no licence at all (`no_license`,
`plugin_header_no_license`). One detail is easy to get wrong: the readme
test is about *shape*, not GPL compatibility. `License: Proprietary` in the
readme alone passes `invalid_license`; it is caught by the header rule or by
the mismatch. So the checker now follows the same three rules, with the same
normalisation, rather than a simpler "GPL or fail" test that would disagree
with Plugin Check on edge cases.

## What changed

- **Licence problems fail the check**, reported with Plugin Check's own
  error codes, in the CLI, the JSON output and the browser table.
- **A missing header `License` fails**, as `plugin_header_no_license` does.
  It used to be "recommended".
- **`License URI` is no longer required** (audit defect 4). The readme docs
  mark it optional and Plugin Check does not check it; it is now reported as
  recommended.
- **The nonce claim is corrected** (audit defect 8). The page said plugin
  review looks for a nonce "anywhere in a file". Plugin Check's rule (WPCS
  `NonceVerification`) works per function; ours is a simpler file-level
  check, and the page now says so.

Eight new tests pin the rules, including the cases above. Two seeded bugs,
dropping the licence gate from the result and disabling the mismatch rule,
both turned a test red.

## Still not at the bar

The audit's other medium defects are open and listed in the tool's README
under "Known gaps": `sanitize_text_field` still counts as output escaping,
header parsing departs from core's `get_file_data()`, the nonce check is
file-level, and the 5-tag and 150-character limits are not checked. A later
audit round re-scores the tool; this post does not.

This checker reads file contents for patterns. A clean result is not a
determination that Plugin Review will approve a plugin, and it is not legal
advice about licensing.
