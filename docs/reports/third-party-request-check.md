# Third-party request check (2026-10-29)

`platform/ci/check_third_party_requests.py` (CI step in `portfolio-validate.yml`)
fails when a `.html` file under `ventures/` loads a script, stylesheet, font,
frame, media or CSS `url()`/`@import` from an absolute non-placeholder host.
`<a href>`, canonical, alternate and `example.*` hosts are ignored.

- First sweep: 1 hit in ~2,900 html files (Google Fonts in
  `retail-pilot-intel/apps/portal/index.html`), removed; fallbacks were in CSS.
- Not covered: JS `fetch`/XHR/WebSocket targets, and the built `_site`. A
  follow-up could scan `.mjs` for non-BYOK hosts.
- Allowlist: `ALLOWED` in the script; empty today.
