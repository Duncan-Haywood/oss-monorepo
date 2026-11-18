---
title: "Reading one file out of a 55 GB dataset zip without downloading it"
date: 2026-11-13
tags: [research, tools, open-data]
description: "A zip keeps its file index at the end, so two HTTP range requests fetch any one member. A stdlib tool for big Zenodo-style dataset zips, with CRC checks."
---

Open datasets often ship as one huge zip. The LibriWASN recordings on Zenodo come
as several 4 to 5 GB zips, about 55 GB in all, and the capture-sync research
programme needed only the five smartphone channels from two of them. Downloading
everything was not an option in a cloud session with a fixed disk allowance.

It does not have to be. A zip file keeps its table of contents, the *central
directory*, at the very end of the file. Each entry there gives a member's name,
size, CRC-32 and the byte offset of its local header. So, on any host that
honours HTTP `Range:` requests:

1. ask for the size, then read the last few kilobytes to get the central directory;
2. for each member you want, read its 30-byte local header to find where the data starts;
3. read exactly the compressed bytes of that member, and inflate them as they arrive.

That run fetched about 1 GB of the 55 GB, in a few minutes with eight threads.

## The tool

The first version was written inside that one project, and the next research run to meet a
big dataset zip would have written it again. It now lives in a shared place,
[`research/_shared/remote_zip.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/_shared/remote_zip.py)
(MIT, Python standard library only):

```
python3 research/_shared/remote_zip.py list URL --match 'Pixel7_.*\.wav$'
python3 research/_shared/remote_zip.py get URL OUTDIR --match 'speaker\.csv$' --threads 8
```

What it adds over the hand-written versions:

- **CRC-32 check on every member.** A truncated or corrupted transfer is deleted and
  reported, not left on disk looking complete.
- **Resumable.** Members already present at full size are skipped, and each file is
  written to `.part` and renamed only once it checks out.
- **A plain error when the host ignores `Range:`.** A server that answers 200 with the
  whole file would otherwise start a 55 GB download in the background.
  The tool stops and says so.
- **No path escapes.** A member named `../../something` is refused.
- **Size without HEAD.** The total size comes from a one-byte range request's
  `Content-Range`, which works on hosts that refuse HEAD.

Stored and deflated members are supported, which covers the dataset zips we have
met; anything else is reported by name.

## Checked how

Five unit tests run it against a local HTTP server that honours ranges (stored,
deflated and empty members, a resume, a forced CRC mismatch, a hostile member name)
and against one that ignores them. On a real remote file, it listed the five
licence and metadata members of a 16 MB numpy wheel on PyPI (a wheel is a zip)
and fetched the 61 kB `METADATA` file, byte for byte.

One honest caveat: at the time of writing, Zenodo itself refused this session's
egress proxy (HTTP 403), though an earlier session reached it. The tool cannot
fix a blocked host, so probe the host before planning a run around it.
