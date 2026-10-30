# Polish 2026-10-29: the floating mic no longer sits on the text

**Weak spot.** Two earlier polish reports noted that the floating "Speak or type" button (bottom right on every
calculator page, `platform/pages/assistant.mjs`) overlaps body text on phones. A fixed button always covers
something while you scroll, and it covered the last lines of the page.

**Change.** (1) It slides down and fades out while the reader scrolls down (past 200 px, movement over 8 px) and
returns on any upward scroll, or when it has keyboard focus. (2) Under 560 px the body gets 72 px of bottom
padding so the final lines and footer are never underneath it. (3) The transition is off under
`prefers-reduced-motion`. No new request; without JavaScript the button does not exist, as before.

**Measured.** `node --test platform/pages/assistant.test.mjs`: 16 pass, 0 fail (one new test). I did not run a
phone screenshot of the built site: the full build takes about 20 minutes and I did not wait for it, so the
behaviour is checked by reading the CSS and script, not by eye.

**Next.** Screenshot a calculator page at 390 px mid-scroll to confirm; shift-roster-builder still has ~400 px of
text before its buttons; changepoint-detector's action is at y = 762. Lighthouse not run; traffic unmeasured.
