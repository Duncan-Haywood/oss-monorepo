# Universal light/dark mode

Every page marisstella.app serves follows one Auto / Light / Dark choice
(owner, 2026-11-28: "we want universal dark/light mode"). The choice is made
with the **Theme** control at the foot of every page and stays in the
visitor's browser (`localStorage` key `pfs-theme`; listed in the cookie
policy). Auto, the default, follows the device setting.

It is a pass over the built site, not something each page implements:

```bash
node platform/theme/apply.mjs platform/pages/dist
```

`platform/pages/build.mjs` runs it before the offline layer; the deploy
workflow and `publish-branch.sh` run it again over the pages written after
the build (the dashboard, the daily brief, the deploy page). It is
idempotent.

## What a page gets

| Piece | Where | What it does |
|---|---|---|
| Boot | inline, first in `<head>` | Reads the choice, sets `data-theme="light\|dark"` on `<html>` (none for Auto) before first paint, and answers `matchMedia('(prefers-color-scheme: …)')` with the choice so page scripts follow it. |
| CSS rewrite | every `.css` file and inline `<style>` | Each `@media (prefers-color-scheme: dark)` block also applies under an explicit Dark and stops under an explicit Light. Selectors keep their specificity (the condition is in `:where()`); cascade order is unchanged. Same for `light` blocks. |
| Fallback | pages marked `data-theme-fallback` | A page with no dark styles of its own is drawn inverted with hues kept (`invert(.9) hue-rotate(180deg)`), pictures, video, canvases and iframes inverted back, so it is dark rather than a white slab. A page that measures dark at load (dark by design, no media query) is switched to native instead. |
| Control | `pf-theme.js`, deferred | Auto / Light / Dark buttons appended to the venture footer or the site footer. |

A page is *native* (`data-theme-native`) when its own inline styles or local
stylesheets style a dark scheme; the site chrome sheets (`pf-site.css`,
`pf-chrome.css`, `pf-embed.css`) do not count, since they say nothing about
the page under the chrome. On the 2026-11-28 build: 13,706 pages, 10,165
native, 3,541 on the fallback.

## Making a page look its best in dark

The fallback is a floor, not a design. To give a page a real dark mode, add
`@media (prefers-color-scheme: dark) { … }` rules (custom properties on
`:root` are easiest); the pass makes them obey the switch, and the page
stops being inverted. Mark anything that must not be inverted on a fallback
page with `data-theme-keep`.

## Limits

- CSS built inside JavaScript strings is not rewritten; such rules follow
  the device setting, not an explicit choice. `matchMedia` answers are
  patched, so script that reads the scheme does follow it.
- Products served from their own origins (`*.marisstella.app` apps) do not
  share `localStorage` with the catalogue, so their choice is separate.

Tests: `node --test platform/theme/*.test.mjs`.
