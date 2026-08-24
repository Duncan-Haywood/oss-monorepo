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
    // Fails branding_filename (listing photo whose name contains a branding token).
    await makePhoto(join(dir, "agent-logo.png"), 1600, 1200);
    // Brand/microsite companions — must be ignored, not treated as listing photos.
    await makePhoto(join(dir, "logo.png"), 1600, 1200);
    await makePhoto(join(dir, "headshot.jpg"), 1600, 1200);
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
    assert(!byName.has("logo.png"), "logo.png is Brand collateral, not a listing photo");
    assert(!byName.has("headshot.jpg"), "headshot.jpg is Brand collateral, not a listing photo");

    // An all-clean folder should report ok.
    const cleanDir = await mkdtemp(join(tmpdir(), "listing-lens-preflight-clean-"));
    try {
      await makePhoto(join(cleanDir, "kitchen.png"), 1600, 1200);
      await makePhoto(join(cleanDir, "logo.png"), 400, 400);
      await makePhoto(join(cleanDir, "headshot.jpg"), 400, 400);
      const cleanSummary = await preflightDir(cleanDir);
      assert(cleanSummary.ok, "all-clean folder should report ok");
      assert(cleanSummary.blockingCount === 0, "all-clean folder should have 0 blocking findings");
      assert(cleanSummary.reports.length === 1, "branding companions must not be checked");
    } finally {
      await rm(cleanDir, { recursive: true, force: true });
    }

    // A complete enhance+Brand delivery co-locates the agent's own
    // logo/headshot with the listing photos (cli-microsite.ts's
    // --agent-logo/--agent-headshot). Those must be excludable so they
    // don't trip branding_filename as if they were MLS-bound photos.
    const brandedDir = await mkdtemp(join(tmpdir(), "listing-lens-preflight-branded-"));
    try {
      await makePhoto(join(brandedDir, "living-room.png"), 1600, 1200);
      await makePhoto(join(brandedDir, "agent-logo.png"), 1600, 1200);
      await makePhoto(join(brandedDir, "agent-headshot.png"), 1600, 1200);

      const uncheckedSummary = await preflightDir(brandedDir);
      assert(!uncheckedSummary.ok, "without exclusions, branding assets should still fail preflight");
      assert(uncheckedSummary.blockingCount === 2, "both branding assets should fail without exclusions");

      const excludedSummary = await preflightDir(brandedDir, ["agent-logo.png", "agent-headshot.png"]);
      assert(excludedSummary.reports.length === 1, "excluded branding assets must not appear in reports");
      assert(excludedSummary.ok, "delivery should pass once branding assets are excluded");
      assert(excludedSummary.blockingCount === 0, "excluded branding assets contribute no findings");
    } finally {
      await rm(brandedDir, { recursive: true, force: true });
    }

    // Empty / non-image folders must not report ok — nothing was checked.
    const emptyDir = await mkdtemp(join(tmpdir(), "listing-lens-preflight-empty-"));
    try {
      const emptySummary = await preflightDir(emptyDir);
      assert(!emptySummary.ok, "empty folder should not report ok");
      assert(emptySummary.reports.length === 0, "empty folder should have 0 reports");

      await writeFile(join(emptyDir, "notes.txt"), "not an image");
      const noPhotosSummary = await preflightDir(emptyDir);
      assert(!noPhotosSummary.ok, "folder with no listing photos should not report ok");
      assert(noPhotosSummary.reports.length === 0, "non-image files must not count as checked photos");
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
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
