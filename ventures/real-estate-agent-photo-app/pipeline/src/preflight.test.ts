/**
 * preflight.test.ts — `npm test` (tsx, no test framework dependency).
 *
 * Exercises preflightDir end-to-end against a real temp directory (unlike
 * research/src/lib/photo-spec.test.ts, which calls checkBatch directly on
 * in-memory bytes) so the fs-reading glue in preflight.ts is covered too.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import { preflightDir } from "./preflight";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function makePhoto(path: string, width: number, height: number) {
  await sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 110, b: 100 } },
  })
    .png()
    .toFile(path);
}

async function run() {
  const dir = await mkdtemp(join(tmpdir(), "listing-lens-preflight-"));

  try {
    // Passes every rule.
    await makePhoto(join(dir, "living-room.png"), 1600, 1200);
    // Fails long_edge (too small).
    await makePhoto(join(dir, "hallway.png"), 200, 150);
    // Fails branding_filename.
    await makePhoto(join(dir, "agent-logo.png"), 1600, 1200);
    // Not a listing photo — must be ignored entirely.
    await writeFile(join(dir, "notes.txt"), "not an image");

    const summary = await preflightDir(dir);

    assert(summary.reports.length === 3, `expected 3 photo reports, got ${summary.reports.length}`);
    assert(!summary.ok, "summary should not be ok when a blocking finding exists");
    assert(summary.blockingCount === 2, `expected 2 blocking findings, got ${summary.blockingCount}`);

    const byName = new Map(summary.reports.map((r) => [r.info.name, r]));
    assert(byName.get("living-room.png")!.findings.length === 0, "living-room.png should pass");
    assert(
      byName.get("hallway.png")!.findings.some((f) => f.rule === "long_edge"),
      "hallway.png should fail long_edge",
    );
    assert(
      byName.get("agent-logo.png")!.findings.some((f) => f.rule === "branding_filename"),
      "agent-logo.png should fail branding_filename",
    );
    assert(!byName.has("notes.txt"), "notes.txt must not be treated as a photo");

    // An all-clean folder should report ok.
    const cleanDir = await mkdtemp(join(tmpdir(), "listing-lens-preflight-clean-"));
    try {
      await makePhoto(join(cleanDir, "kitchen.png"), 1600, 1200);
      const cleanSummary = await preflightDir(cleanDir);
      assert(cleanSummary.ok, "all-clean folder should report ok");
      assert(cleanSummary.blockingCount === 0, "all-clean folder should have 0 blocking findings");
    } finally {
      await rm(cleanDir, { recursive: true, force: true });
    }

    console.log("preflight.test.ts: all assertions passed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
