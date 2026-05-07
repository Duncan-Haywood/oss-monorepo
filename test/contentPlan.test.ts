import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createInstagramContentPlan,
  type GradedMediaAsset,
} from "../src/content/instagramPlan.ts";

describe("createInstagramContentPlan", () => {
  const assets: GradedMediaAsset[] = [
    {
      id: "clip-hero",
      kind: "video",
      captureTime: "2026-05-07T19:02:00Z",
      durationSeconds: 8,
      orientation: "landscape",
      qualityScore: 0.94,
      storyTags: ["hero", "wide", "golden-hour"],
    },
    {
      id: "clip-detail",
      kind: "video",
      captureTime: "2026-05-07T19:05:00Z",
      durationSeconds: 6,
      orientation: "portrait",
      qualityScore: 0.88,
      storyTags: ["detail", "motion"],
    },
    {
      id: "clip-long",
      kind: "video",
      captureTime: "2026-05-07T19:08:00Z",
      durationSeconds: 40,
      orientation: "landscape",
      qualityScore: 0.97,
      storyTags: ["hero"],
    },
    {
      id: "photo-cover",
      kind: "photo",
      captureTime: "2026-05-07T19:01:00Z",
      orientation: "portrait",
      qualityScore: 0.96,
      storyTags: ["cover", "portrait"],
    },
    {
      id: "photo-detail",
      kind: "photo",
      captureTime: "2026-05-07T19:04:00Z",
      orientation: "landscape",
      qualityScore: 0.9,
      storyTags: ["detail"],
    },
    {
      id: "photo-backup",
      kind: "photo",
      captureTime: "2026-05-07T19:06:00Z",
      orientation: "landscape",
      qualityScore: 0.55,
      storyTags: ["backup"],
    },
  ];

  it("builds reel and carousel briefs from the highest quality graded assets", () => {
    const plan = createInstagramContentPlan({
      assets,
      brandVoice: "cinematic but practical",
      maxReelDurationSeconds: 18,
      projectTitle: "Desert Campaign",
    });

    assert.deepEqual(plan.deliverables.map((deliverable) => deliverable.type), [
      "reel",
      "carousel",
      "photo_post",
    ]);
    assert.deepEqual(plan.deliverables[0]?.assetIds, [
      "clip-hero",
      "clip-detail",
    ]);
    assert.equal(plan.deliverables[0]?.targetAspectRatio, "9:16");
    assert.equal(plan.deliverables[0]?.estimatedDurationSeconds, 14);
    assert.deepEqual(plan.deliverables[1]?.assetIds, [
      "photo-cover",
      "photo-detail",
    ]);
    assert.deepEqual(plan.deliverables[2]?.assetIds, ["photo-cover"]);
    assert.match(plan.editorNotes.join("\n"), /vertical/i);
  });

  it("returns review warnings instead of low quality automation when source material is thin", () => {
    const plan = createInstagramContentPlan({
      assets: [
        {
          id: "soft-photo",
          kind: "photo",
          captureTime: "2026-05-07T19:02:00Z",
          orientation: "landscape",
          qualityScore: 0.41,
          storyTags: ["backup"],
        },
      ],
      brandVoice: "premium editorial",
      maxReelDurationSeconds: 30,
      projectTitle: "Sparse Shoot",
    });

    assert.deepEqual(plan.deliverables, []);
    assert.match(plan.reviewWarnings.join("\n"), /not enough high-quality/i);
  });

  it("warns when no graded assets are available for automation", () => {
    const plan = createInstagramContentPlan({
      assets: [],
      brandVoice: "premium editorial",
      maxReelDurationSeconds: 30,
      projectTitle: "Empty Shoot",
    });

    assert.deepEqual(plan.deliverables, []);
    assert.match(plan.reviewWarnings.join("\n"), /not enough high-quality/i);
  });

  it("rejects duplicate asset IDs because deliverable plans must be traceable", () => {
    assert.throws(
      () =>
        createInstagramContentPlan({
          assets: [
            {
              id: "duplicate",
              kind: "photo",
              captureTime: "2026-05-07T19:02:00Z",
              orientation: "landscape",
              qualityScore: 0.8,
              storyTags: ["detail"],
            },
            {
              id: "duplicate",
              kind: "video",
              captureTime: "2026-05-07T19:03:00Z",
              durationSeconds: 5,
              orientation: "portrait",
              qualityScore: 0.9,
              storyTags: ["motion"],
            },
          ],
          brandVoice: "premium editorial",
          maxReelDurationSeconds: 30,
          projectTitle: "Duplicate IDs",
        }),
      /duplicate asset id/i,
    );
  });
});
