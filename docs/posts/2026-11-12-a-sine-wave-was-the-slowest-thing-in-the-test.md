---
title: "A sine wave was the slowest thing in the test"
seo_title: "Why a test fixture's audio track cost more than its video"
date: 2026-11-12
tags: [photo-editing, performance, perf]
description: "The slowest photo-editing test spent 1.4 s encoding 46 seconds of a tone nobody listened to. A 1 s track made it 21% faster."
---

The [photo-editing](https://marisstella.app/photo-editing/) pipeline takes a card of photos and clips, grades them and cuts Instagram media. Its slowest test makes two 46-second clips of the same shot and checks that only the clip the story picks gets a full-resolution master. It took 8.6 seconds.

We timed every ffmpeg command it ran. The review proxy of the first clip took 1.64 s and the second took 0.29 s. They are the same size and the same picture. The only difference is that the first clip has a 46-second sine-wave audio track, there so the two takes aren't byte-identical files.

Split apart, the proxy's video took 0.28 s and its audio took 1.44 s. ffmpeg's built-in AAC encoder runs about 32 times faster than real time on this machine. That is fine for a shoot, where the video is 4K and dwarfs it. In a test whose video runs at one frame per second, it is most of the bill. Its faster mode only got 1.35 s down to 1.03 s, so we left the product alone.

The test never listens to the audio. The length it cares about, 46 s (one second over what a 45-second reel variant can hold), comes from the container, which is as long as its longest stream. So the fixture now has a one-second tone. The container still reads 46 s, and the test went from 8.6 s to 6.9 s.

The same pass found a smaller thing in real code. Loading a shoot's analysis files checked each file for symlinks and escapes, and resolved the workspace folder again twice per file along the way. Loading 10,000 files now resolves it once. Each file and its parents are still checked one by one. That load is about a fifth faster, and the output is byte for byte the same.

The numbers, and what to try next: [`ci-perf-2026-11-12-photo-editing-fixture-audio.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-12-photo-editing-fixture-audio.md).
