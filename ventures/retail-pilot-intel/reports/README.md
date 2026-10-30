# Reports

Long-form assessments live as native TSX in **`apps/docs/src/pages/commercial-viability/`**. See `docs/README.md` for build and deploy.

The converter `scripts/convert-html-to-tsx.ts` was a one-time migration. Two of
its inputs (`commercial-viability-assessment.html` and `-deep-dive.html`) had
been overwritten with their TSX output, so they were removed on 2026-10-25;
the TSX pages are the source. `platform/ci/check_html_is_html.py` fails CI if a
`.html` file under `ventures/` holds code instead of markup.
