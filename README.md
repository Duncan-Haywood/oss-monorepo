# MediaFlow

MediaFlow is a local-first personal tool and product concept for photographers
and videographers who want faster turnaround on high-quality Instagram reels,
carousels, stills, and intermediate graded assets.

The first working slice is a checksum-verified ingest planner for safely moving
large shoots from camera cards, local folders, or external SSDs into an organized
media library. It is intentionally conservative about originals: copy is the
default, move requires explicit source-removal consent, and every execution
writes a manifest.

## Current CLI

Detect likely card or shoot roots:

```bash
python3 -m mediaflow.cli sources /Volumes /media/$USER
```

Dry-run an ingest from a card or shoot folder:

```bash
python3 -m mediaflow.cli ingest \
  --source /Volumes/CAMERA_CARD \
  --destination /Volumes/MediaSSD/MediaFlowLibrary \
  --source-kind removable
```

Execute the verified copy:

```bash
python3 -m mediaflow.cli ingest \
  --source /Volumes/CAMERA_CARD \
  --destination /Volumes/MediaSSD/MediaFlowLibrary \
  --source-kind removable \
  --execute
```

Move mode exists for local folders, but deletion of originals is never implicit:

```bash
python3 -m mediaflow.cli ingest \
  --source ~/Shoots/Delivered \
  --destination /Volumes/MediaSSD/MediaFlowLibrary \
  --mode move \
  --allow-source-removal \
  --execute
```

## Library layout

Files are grouped by UTC file timestamp and media kind:

```text
MediaFlowLibrary/
  2026/
    2026-05-06/
      photos/
      raw/
      videos/
      sidecars/
  _manifests/
    ingest-20260506T140000Z.json
```

Name collisions are preserved with checksum suffixes instead of overwriting.

## Verification

```bash
python3 -m unittest discover -s tests
```

## Product direction

See:

- `docs/design-decisions.md`
- `docs/terms-and-risk.md`