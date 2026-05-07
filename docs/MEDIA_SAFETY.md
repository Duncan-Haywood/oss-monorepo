# Media Safety Policy

This product only earns trust if originals are safer after using it than before.

## Non-negotiable rules

1. **Never delete originals by default.**
2. **Never move by blind rename from removable media.** Treat move as copy,
   verify, then optional delete.
3. **Never overwrite a different file.** Use checksum-aware duplicate detection
   and collision-safe destination names.
4. **Never hide uncertainty.** Surface missing free space, unreadable files,
   checksum mismatches, partial copies, and ambiguous drives.
5. **Never rely on folder names alone.** Persist a manifest with source,
   destination, checksum, byte count, and operation state.

## Import lifecycle

### 1. Detect

Classify attached volumes conservatively:

- removable card;
- camera or phone;
- external SSD/archive;
- local source folder;
- unknown volume.

Unknown volumes should require explicit user confirmation before use.

### 2. Plan

Before copying, show:

- files found;
- total bytes;
- destination;
- available destination space;
- duplicates and collisions;
- sidecar groups;
- estimated copy operations;
- whether sources will be preserved.

### 3. Copy

Copy originals into the shoot archive. Use bounded concurrency so fast local SSDs
are used efficiently without overwhelming SD cards or causing thermal throttling.

### 4. Verify

For each copied file:

- compare byte count;
- compare checksum;
- record the result in the manifest;
- keep retry attempts visible.

### 5. Mark complete

Only after every required original verifies should the shoot be marked imported.
Partial imports should be resumable and clearly labeled.

### 6. Optional cleanup

Source deletion requires all of the following:

- destination copy verified by checksum;
- manifest persisted;
- user explicitly enabled delete-after-copy for this import;
- source is not the only known copy;
- operation can be audited.

Prefer "eject card after verified copy" over automatic deletion for early
versions.

Implementation note: import planning may record that cleanup was requested, but
copy operations should still preserve sources. Deletion belongs to a separate
post-verification cleanup plan.

## Collision policy

- Same destination name + same checksum: skip as duplicate.
- Same destination name + different checksum: write `name-1.ext`, `name-2.ext`,
  and so on.
- Same planned destination in one batch + same checksum: skip later duplicates.
- Same planned destination in one batch + different checksum: assign unique
  destination names.
- Symlinked source media: skip and warn.
- Symlinked destination path: reject the plan before any executor can write
  outside the intended archive.

## Manifest fields

Minimum manifest row:

- import ID;
- source volume ID and mount path;
- source path;
- destination path;
- original filename;
- sidecar group key;
- media type;
- byte count;
- checksum algorithm and checksum;
- operation state;
- started/completed timestamps;
- error message if any;
- app version and planner version.

## AI safety for media decisions

AI may recommend rejects, selects, crops, grades, and edits. It must not delete
or permanently alter originals. Destructive actions belong to a separate
verified-storage policy, not model output.

## User-facing copy

Use plain, trust-building language:

- "Copy originals first"
- "Verify every copied file"
- "Keep source files on the card"
- "Delete from source only after verified copy"
- "This card has files that are not in your archive yet"

Avoid vague labels such as "clean up" for destructive actions.
