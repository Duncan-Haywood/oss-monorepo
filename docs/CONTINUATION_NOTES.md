# Continuation Notes

## Current state

This repo began as a README-only project. The current branch adds:

- TypeScript project setup.
- Safe ingest planning core.
- Instagram deliverable planning core.
- Tests for file classification, ingest safety, collision-safe paths, move
  semantics, and deliverable planning.
- Product, architecture, and legal draft docs.

## Design decisions

- Start with side-effect-free planning functions. The app should generate plans
  before touching files, drives, renders, or social exports.
- Treat source deletion as out of scope for automation. Even "move" means copy,
  verify, and review.
- Keep path planning deterministic so manifests can be tested and trusted.
- Use VLMs for semantic and creative decisions, not for file safety decisions.
- Build native Mac/iPhone UI later, after the domain model and safety contracts
  are stable.

## Useful next increments

1. **Manifest writer and CLI dry run**
   - Add a CLI command that accepts a folder listing or JSON file candidates.
   - Writes an ingest manifest without copying files.
   - Tests malformed inputs, empty shoots, and duplicate names.

2. **macOS drive detection adapter design**
   - Add an interface for detected volumes.
   - Implement a mock adapter in TypeScript.
   - Document the future Swift/Disk Arbitration bridge.

3. **Asset database model**
   - Add SQLite schema docs or migrations.
   - Persist projects, assets, checksums, and operations.

4. **Metadata extraction adapters**
   - Define interfaces for ExifTool and FFprobe.
   - Add fixtures for RAW, JPEG, MOV, MP4, and LUT metadata.

5. **Color grading plan**
   - Represent camera transforms, LUT choices, reference matching, and output
     intermediate assets.
   - Keep actual rendering behind adapters.

6. **Native app scaffold**
   - Start a Swift package or Xcode project when the environment can support
     native development.
   - Share contracts with this TypeScript core or port the pure domain logic.

## Verification commands

```bash
npm test
npm run typecheck
```

## Cautions for future agents

- Do not add automatic delete operations.
- Do not bury warnings from missing checksums.
- Do not let social export code mutate ingest manifests.
- Do not make VLM calls part of deterministic ingest planning.
- Keep tests first for behavior-bearing changes.
