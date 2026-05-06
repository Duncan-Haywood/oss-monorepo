# Photo Editing Automation

A personal-tool/product prototype for bulk ingesting, organizing, color grading,
and repackaging photo/video shoots into finished social content.

The long-term product is a Mac + iPhone workflow for photographers and
videographers who want faster turnaround on Instagram reels, carousels, stills,
and intermediate color-graded deliverables without handing file management and
editing quality completely to a black box.

## Current iteration

This branch starts with the safest foundation: an ingest-planning core. It does
not delete or move files yet. It builds a copy-then-verify plan from a source
root such as an SD card to a destination library such as a local folder or
external SSD.

```bash
cargo test
```

Implemented behavior:

- classify raw photos, JPEGs, videos, sidecars, and other files
- preserve relative shoot structure under media-kind buckets
- reject files outside the chosen source root
- reject duplicate planned destinations and caller-provided reserved/existing
  destinations instead of overwriting
- reject unsafe shoot slugs and relative source/destination paths
- produce copy-then-verify operations only; deletion is explicitly absent

## Product direction

See:

- `docs/product-strategy.md` for the audience, wedge, and business viability
- `docs/design-decisions.md` for technical decisions and future architecture
- `docs/legal/terms-and-conditions.md` for draft product terms and
  indemnification language that needs legal review before use

## Safety principle

Original camera media should be treated as irreplaceable. Automation may copy,
verify, index, render proxies, and generate edits, but destructive actions
should require explicit user approval, independent backups, and an audit trail.