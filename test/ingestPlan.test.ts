import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  categorizeMediaFile,
  planShootIngest,
  type IngestOperation,
  type MediaFileCandidate,
} from "../src/ingest/ingestPlan.ts";

describe("categorizeMediaFile", () => {
  it("classifies camera originals, edits, logs, sidecars, and unknown files by extension", () => {
    assert.equal(categorizeMediaFile("IMG_0001.CR3"), "raw_photo");
    assert.equal(categorizeMediaFile("select.JPG"), "processed_photo");
    assert.equal(categorizeMediaFile("A001_C001_0507AB.BRAW"), "raw_video");
    assert.equal(categorizeMediaFile("clip.MOV"), "video");
    assert.equal(categorizeMediaFile("Alexa_LogC_to_Rec709.cube"), "color_log");
    assert.equal(categorizeMediaFile("IMG_0001.XMP"), "sidecar");
    assert.equal(categorizeMediaFile("field-audio.WAV"), "audio");
    assert.equal(categorizeMediaFile("producer-notes.txt"), "unknown");
  });
});

describe("planShootIngest", () => {
  const baseFiles: MediaFileCandidate[] = [
    {
      sourcePath: "/Volumes/CARD/DCIM/100CANON/IMG_0001.CR3",
      byteSize: 44_100_000,
      checksum: "sha256:raw-1",
    },
    {
      sourcePath: "/Volumes/CARD/DCIM/100CANON/IMG_0001.JPG",
      byteSize: 5_200_000,
      checksum: "sha256:jpeg-1",
    },
    {
      sourcePath: "/Volumes/CARD/PRIVATE/M4ROOT/CLIP/C0001.MP4",
      byteSize: 820_000_000,
      checksum: "sha256:clip-1",
    },
    {
      sourcePath: "/Volumes/CARD/LUTS/SHOW.cube",
      byteSize: 2_400,
    },
  ];

  it("creates deterministic copy and verify operations without source deletion", () => {
    const plan = planShootIngest({
      destinationRoot: "/Volumes/WorkSSD/Shoots",
      files: baseFiles,
      projectSlug: "Desert Campaign",
      shootDate: "2026-05-07",
    });

    assert.equal(
      plan.sessionRoot,
      "/Volumes/WorkSSD/Shoots/2026/2026-05-07-desert-campaign",
    );
    assert.deepEqual(
      plan.operations.map((operation) => operation.type),
      [
        "copy",
        "verify_checksum",
        "copy",
        "verify_checksum",
        "copy",
        "verify_checksum",
        "copy",
      ],
    );
    assert.equal(
      destinationPath(plan.operations[0]),
      "/Volumes/WorkSSD/Shoots/2026/2026-05-07-desert-campaign/originals/raw-photo/IMG_0001.CR3",
    );
    assert.equal(
      destinationPath(plan.operations[2]),
      "/Volumes/WorkSSD/Shoots/2026/2026-05-07-desert-campaign/originals/processed-photo/IMG_0001.JPG",
    );
    assert.equal(
      destinationPath(plan.operations[4]),
      "/Volumes/WorkSSD/Shoots/2026/2026-05-07-desert-campaign/originals/video/C0001.MP4",
    );
    assert.equal(
      destinationPath(plan.operations[6]),
      "/Volumes/WorkSSD/Shoots/2026/2026-05-07-desert-campaign/reference/color-log/SHOW.cube",
    );
    assert.equal(
      plan.operations.some((operation) => operation.type === "delete_source"),
      false,
    );
    assert.deepEqual(
      plan.manifestEntries.map((entry) => entry.kind),
      ["raw_photo", "processed_photo", "video", "color_log"],
    );
  });

  it("keeps duplicate file names by allocating collision-safe destination names", () => {
    const plan = planShootIngest({
      destinationRoot: "/Volumes/WorkSSD/Shoots",
      files: [
        {
          sourcePath: "/Volumes/CARD_A/DCIM/IMG_0001.CR3",
          byteSize: 44_100_000,
        },
        {
          sourcePath: "/Volumes/CARD_B/DCIM/IMG_0001.CR3",
          byteSize: 44_250_000,
        },
        {
          sourcePath: "/Volumes/CARD_C/DCIM/IMG_0001.CR3",
          byteSize: 44_275_000,
        },
      ],
      projectSlug: "Two Camera Shoot",
      shootDate: "2026-05-07",
    });

    assert.deepEqual(
      plan.operations
        .filter((operation) => operation.type === "copy")
        .map((operation) => operation.destinationPath),
      [
        "/Volumes/WorkSSD/Shoots/2026/2026-05-07-two-camera-shoot/originals/raw-photo/IMG_0001.CR3",
        "/Volumes/WorkSSD/Shoots/2026/2026-05-07-two-camera-shoot/originals/raw-photo/IMG_0001-2.CR3",
        "/Volumes/WorkSSD/Shoots/2026/2026-05-07-two-camera-shoot/originals/raw-photo/IMG_0001-3.CR3",
      ],
    );
  });

  it("rejects directory-like source paths that cannot safely produce file destinations", () => {
    assert.throws(
      () =>
        planShootIngest({
          destinationRoot: "/Volumes/WorkSSD/Shoots",
          files: [
            {
              sourcePath: "/Volumes/CARD/DCIM/..",
              byteSize: 0,
            },
          ],
          projectSlug: "Bad Source",
          shootDate: "2026-05-07",
        }),
      /sourcePath must point to a file/i,
    );

    assert.throws(
      () =>
        planShootIngest({
          destinationRoot: "/Volumes/WorkSSD/Shoots",
          files: [
            {
              sourcePath: "/Volumes/CARD/DCIM/",
              byteSize: 0,
            },
          ],
          projectSlug: "Bad Source",
          shootDate: "2026-05-07",
        }),
      /sourcePath must point to a file/i,
    );
  });

  it("models moves as copy-verify-review and warns when verification evidence is missing", () => {
    const plan = planShootIngest({
      destinationRoot: "/Volumes/ArchiveSSD/Shoots",
      files: [
        {
          sourcePath: "/Volumes/CARD/DCIM/IMG_0002.CR3",
          byteSize: 44_100_000,
        },
      ],
      projectSlug: "Safety First",
      shootDate: "2026-05-07",
      transferMode: "move",
    });

    assert.deepEqual(
      plan.operations.map((operation) => operation.type),
      ["copy", "mark_source_reviewed"],
    );
    assert.match(
      plan.warnings.join("\n"),
      /missing checksum/i,
    );
    assert.match(
      plan.warnings.join("\n"),
      /no delete operation/i,
    );
  });
});

function destinationPath(operation: IngestOperation | undefined): string {
  assert.ok(operation !== undefined);
  assert.ok("destinationPath" in operation);
  return operation.destinationPath;
}
