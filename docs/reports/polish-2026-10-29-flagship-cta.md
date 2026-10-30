# Polish 2026-10-29: first-screen buttons on four flagship tool pages

**Weak surface.** `polish-2026-10-29-site-scan.md` found the AI Bookkeeper page opened with a dense paragraph and
no visible action on a 390 px phone. AI Bookkeeper has since gained its button row (`cta-row`); the other
flagship tool pages that open on a form still had none.

**Change.** A `cta-row` under the `h1` on `wall-framing-takeoff`, `changepoint-detector`, `einvoice-preflight`
and `open-tennis-robots`: a primary link that jumps to the tool's first card and, where the page has a
"load example" button, a second link that clicks it (small inline script, no new request). Colours reuse each
page's own accent.

**Measured (Playwright, 390 px, file://).** Primary button top edge at y = 66, 162, 132 and 227 px, so on the
first screen on all four; no sideways scroll; no page errors; the example link fires.
Not measured: rankings, traffic, Lighthouse, a full site build (static HTML edits only).

**Still weakest / next.**
1. The breadcrumb now truncates to one line on phones (already in `site-nav.mjs`); the floating mic button
   still overlaps body text on some pages.
2. `sales-agent`, `shift-roster-builder` and `league-schedule-generator` have a button only on guide pages, not
   their index; `photo-editing` and `quick-pick-survey` have no `index.html` button row to check.
3. A check that flags a flagship `index.html` with no `a.cta` would keep this fixed.
