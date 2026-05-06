# ShootFlow

ShootFlow is an early personal-tool/product prototype for photographers and
videographers who want faster ingest, safer file management, bulk color
preparation, and automated Instagram-ready deliverables.

The current code focuses on the foundation that must be trustworthy before
AI-assisted grading or reel generation runs at scale:

- non-destructive ingest planning from camera cards, local folders, or SSDs;
- checksum-based duplicate skipping and conflict detection;
- atomic copy execution with a machine-readable ingest manifest;
- storage candidate ranking for camera-card versus working-destination choices.

## Development

Run tests with:

```bash
PYTHONPATH=src python3 -m unittest
```

## Safety stance

ShootFlow should never delete source media automatically. Any future destructive
operation must be opt-in, separately logged, reversible where possible, and
guarded by completed checksum-verified copies.