# Staff schedule pack (shift-roster-builder), 2026-11-02

Third dark paid path after wall-framing-takeoff and league-schedule-generator. Files in `ventures/shift-roster-builder/`: `staffpack.mjs` (pure HTML builder), `licence.mjs` and `checkout.mjs` (copies of the league ones; `VALIDATE_URL` is unconfirmed against live Lemon Squeezy docs), card `#pack-card` in `index.html` (hidden unless `buyLink(CHECKOUT_URL)`), tests in `staffpack.test.mjs`.

For the next run: nothing agent-doable until the owner sets `CHECKOUT_URL`. Then confirm the validate call with a test key, and check the pack in a real print dialog. The three copies of `licence.mjs` could become one shared module if a fourth appears.
