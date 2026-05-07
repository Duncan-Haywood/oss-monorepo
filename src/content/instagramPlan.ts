export type GradedMediaKind = "photo" | "video";
export type MediaOrientation = "landscape" | "portrait" | "square";
export type InstagramDeliverableType = "reel" | "carousel" | "photo_post";

export interface GradedMediaAsset {
  id: string;
  kind: GradedMediaKind;
  captureTime: string;
  orientation: MediaOrientation;
  qualityScore: number;
  storyTags: string[];
  durationSeconds?: number;
}

export interface CreateInstagramContentPlanInput {
  assets: GradedMediaAsset[];
  brandVoice: string;
  maxReelDurationSeconds: number;
  projectTitle: string;
}

export interface InstagramDeliverableBrief {
  type: InstagramDeliverableType;
  title: string;
  assetIds: string[];
  targetAspectRatio: "1:1" | "4:5" | "9:16";
  estimatedDurationSeconds?: number;
  captionPrompt: string;
}

export interface InstagramContentPlan {
  deliverables: InstagramDeliverableBrief[];
  editorNotes: string[];
  reviewWarnings: string[];
}

const MIN_AUTOMATION_QUALITY = 0.7;
const MAX_CAROUSEL_ASSETS = 10;

export function createInstagramContentPlan(
  input: CreateInstagramContentPlanInput,
): InstagramContentPlan {
  assertCreateInstagramContentPlanInput(input);

  const qualifyingVideos = input.assets
    .filter((asset) => asset.kind === "video")
    .filter((asset) => asset.qualityScore >= MIN_AUTOMATION_QUALITY)
    .filter((asset) => (asset.durationSeconds ?? 0) > 0)
    .filter((asset) => (asset.durationSeconds ?? 0) <= input.maxReelDurationSeconds)
    .sort(compareAssetQualityThenTime);
  const reelAssets = selectReelAssets(qualifyingVideos, input.maxReelDurationSeconds);

  const photoAssets = input.assets
    .filter((asset) => asset.kind === "photo")
    .filter((asset) => asset.qualityScore >= MIN_AUTOMATION_QUALITY)
    .sort(compareAssetQualityThenTime)
    .slice(0, MAX_CAROUSEL_ASSETS);

  const deliverables: InstagramDeliverableBrief[] = [];

  if (reelAssets.length > 0) {
    deliverables.push({
      assetIds: reelAssets.map((asset) => asset.id),
      captionPrompt: captionPrompt(input, "short cinematic Reel caption with a clear hook"),
      estimatedDurationSeconds: totalDuration(reelAssets),
      targetAspectRatio: "9:16",
      title: `${input.projectTitle} hero reel`,
      type: "reel",
    });
  }

  if (photoAssets.length >= 2) {
    deliverables.push({
      assetIds: photoAssets.map((asset) => asset.id),
      captionPrompt: captionPrompt(input, "carousel caption that tells the shoot story"),
      targetAspectRatio: "4:5",
      title: `${input.projectTitle} carousel`,
      type: "carousel",
    });
  }

  if (photoAssets.length >= 1) {
    deliverables.push({
      assetIds: [photoAssets[0]?.id ?? ""],
      captionPrompt: captionPrompt(input, "single image caption focused on the strongest frame"),
      targetAspectRatio: photoAssets[0]?.orientation === "square" ? "1:1" : "4:5",
      title: `${input.projectTitle} hero photo`,
      type: "photo_post",
    });
  }

  const editorNotes = buildEditorNotes(reelAssets, photoAssets);
  const reviewWarnings = buildReviewWarnings(input.assets, reelAssets, photoAssets);

  return {
    deliverables,
    editorNotes,
    reviewWarnings,
  };
}

function selectReelAssets(
  assets: GradedMediaAsset[],
  maxDurationSeconds: number,
): GradedMediaAsset[] {
  const selectedAssets: GradedMediaAsset[] = [];
  let runningDuration = 0;

  for (const asset of assets) {
    const durationSeconds = asset.durationSeconds ?? 0;
    if (runningDuration + durationSeconds > maxDurationSeconds) {
      continue;
    }

    selectedAssets.push(asset);
    runningDuration += durationSeconds;
  }

  return selectedAssets.sort(compareAssetTime);
}

function buildEditorNotes(
  reelAssets: GradedMediaAsset[],
  photoAssets: GradedMediaAsset[],
): string[] {
  const notes: string[] = [];

  if (reelAssets.length > 0) {
    notes.push(
      "Reframe reel exports to vertical 9:16 and run subject-safe crop detection before rendering.",
    );
  }

  if (reelAssets.some((asset) => asset.orientation === "landscape")) {
    notes.push(
      "Landscape clips need pan-and-scan or padded compositions so the final vertical cut keeps the subject intact.",
    );
  }

  if (photoAssets.length > 0) {
    notes.push(
      "Use the strongest photo as both carousel opener and optional Reel cover unless the editor flags a better expression or motion frame.",
    );
  }

  return notes;
}

function buildReviewWarnings(
  allAssets: GradedMediaAsset[],
  reelAssets: GradedMediaAsset[],
  photoAssets: GradedMediaAsset[],
): string[] {
  const warnings: string[] = [];

  if (allAssets.length > 0 && reelAssets.length === 0 && photoAssets.length === 0) {
    warnings.push(
      "Not enough high-quality graded assets for safe automation; request human review or improve color/selection first.",
    );
  }

  if (allAssets.length === 0) {
    warnings.push(
      "Not enough high-quality graded assets for safe automation; ingest, grade, or select assets before creating deliverables.",
    );
  }

  if (allAssets.some((asset) => asset.qualityScore < MIN_AUTOMATION_QUALITY)) {
    warnings.push(
      "Some assets fell below the automation quality threshold and were excluded from deliverables.",
    );
  }

  return warnings;
}

function compareAssetQualityThenTime(left: GradedMediaAsset, right: GradedMediaAsset): number {
  const qualityDifference = right.qualityScore - left.qualityScore;
  if (qualityDifference !== 0) {
    return qualityDifference;
  }

  return compareAssetTime(left, right);
}

function compareAssetTime(left: GradedMediaAsset, right: GradedMediaAsset): number {
  return Date.parse(left.captureTime) - Date.parse(right.captureTime);
}

function captionPrompt(
  input: CreateInstagramContentPlanInput,
  goal: string,
): string {
  return [
    `Write a ${goal} for ${input.projectTitle}.`,
    `Voice: ${input.brandVoice}.`,
    "Keep it specific to the shoot, avoid fake behind-the-scenes claims, and include a light call to action.",
  ].join(" ");
}

function totalDuration(assets: GradedMediaAsset[]): number {
  return assets.reduce((sum, asset) => sum + (asset.durationSeconds ?? 0), 0);
}

function assertCreateInstagramContentPlanInput(input: CreateInstagramContentPlanInput): void {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("input must be an object");
  }

  assertNonEmptyString(input.brandVoice, "brandVoice");
  assertNonEmptyString(input.projectTitle, "projectTitle");

  if (
    !Number.isFinite(input.maxReelDurationSeconds) ||
    input.maxReelDurationSeconds <= 0
  ) {
    throw new TypeError("maxReelDurationSeconds must be a positive number");
  }

  if (!Array.isArray(input.assets)) {
    throw new TypeError("assets must be an array");
  }

  const assetIds = new Set<string>();

  for (const [index, asset] of input.assets.entries()) {
    assertNonEmptyString(asset.id, `assets[${index}].id`);
    if (assetIds.has(asset.id)) {
      throw new TypeError(`duplicate asset id: ${asset.id}`);
    }
    assetIds.add(asset.id);

    assertNonEmptyString(asset.captureTime, `assets[${index}].captureTime`);
    if (Number.isNaN(Date.parse(asset.captureTime))) {
      throw new TypeError(`assets[${index}].captureTime must be parseable`);
    }
    if (asset.kind !== "photo" && asset.kind !== "video") {
      throw new TypeError(`assets[${index}].kind must be photo or video`);
    }
    if (
      asset.orientation !== "landscape" &&
      asset.orientation !== "portrait" &&
      asset.orientation !== "square"
    ) {
      throw new TypeError(
        `assets[${index}].orientation must be landscape, portrait, or square`,
      );
    }
    if (!Number.isFinite(asset.qualityScore) || asset.qualityScore < 0 || asset.qualityScore > 1) {
      throw new TypeError(`assets[${index}].qualityScore must be between 0 and 1`);
    }
    if (!Array.isArray(asset.storyTags)) {
      throw new TypeError(`assets[${index}].storyTags must be an array`);
    }
    for (const [tagIndex, tag] of asset.storyTags.entries()) {
      assertNonEmptyString(tag, `assets[${index}].storyTags[${tagIndex}]`);
    }
    if (
      asset.durationSeconds !== undefined &&
      (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds < 0)
    ) {
      throw new TypeError(`assets[${index}].durationSeconds must be non-negative`);
    }
  }
}

function assertNonEmptyString(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}
