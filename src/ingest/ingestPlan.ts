import path from "node:path";

export type MediaKind =
  | "raw_photo"
  | "processed_photo"
  | "raw_video"
  | "video"
  | "color_log"
  | "sidecar"
  | "audio"
  | "unknown";

export type TransferMode = "copy" | "move";

export interface MediaFileCandidate {
  sourcePath: string;
  byteSize: number;
  checksum?: string;
  captureTime?: string;
}

export interface PlanShootIngestInput {
  destinationRoot: string;
  files: MediaFileCandidate[];
  projectSlug: string;
  shootDate: string;
  transferMode?: TransferMode;
}

export interface CopyOperation {
  type: "copy";
  sourcePath: string;
  destinationPath: string;
  byteSize: number;
  kind: MediaKind;
}

export interface VerifyChecksumOperation {
  type: "verify_checksum";
  sourcePath: string;
  destinationPath: string;
  checksum: string;
}

export interface MarkSourceReviewedOperation {
  type: "mark_source_reviewed";
  sourcePath: string;
  reason: string;
}

export interface DeleteSourceOperation {
  type: "delete_source";
  sourcePath: string;
  blockedByDefault: true;
}

export type IngestOperation =
  | CopyOperation
  | VerifyChecksumOperation
  | MarkSourceReviewedOperation
  | DeleteSourceOperation;

export interface ManifestEntry {
  sourcePath: string;
  destinationPath: string;
  byteSize: number;
  checksum?: string;
  kind: MediaKind;
  captureTime?: string;
}

export interface ShootIngestPlan {
  sessionRoot: string;
  transferMode: TransferMode;
  operations: IngestOperation[];
  manifestEntries: ManifestEntry[];
  warnings: string[];
}

const RAW_PHOTO_EXTENSIONS = new Set([
  "3fr",
  "arw",
  "cr2",
  "cr3",
  "dng",
  "erf",
  "iiq",
  "nef",
  "nrw",
  "orf",
  "pef",
  "raf",
  "raw",
  "rw2",
  "rwl",
  "srw",
]);

const PROCESSED_PHOTO_EXTENSIONS = new Set([
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "tif",
  "tiff",
]);

const RAW_VIDEO_EXTENSIONS = new Set(["ari", "braw", "r3d"]);
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "mxf"]);
const COLOR_LOG_EXTENSIONS = new Set(["3dl", "cdl", "cube", "look", "lut"]);
const SIDECAR_EXTENSIONS = new Set(["cos", "dop", "json", "xml", "xmp"]);
const AUDIO_EXTENSIONS = new Set(["aif", "aiff", "m4a", "mp3", "wav"]);

const ORIGINAL_KINDS = new Set<MediaKind>([
  "raw_photo",
  "processed_photo",
  "raw_video",
  "video",
  "audio",
]);

const KIND_DIRECTORY: Record<MediaKind, string> = {
  audio: "audio",
  color_log: "color-log",
  processed_photo: "processed-photo",
  raw_photo: "raw-photo",
  raw_video: "raw-video",
  sidecar: "sidecar",
  unknown: "unknown",
  video: "video",
};

export function categorizeMediaFile(filePath: string): MediaKind {
  assertNonEmptyString(filePath, "filePath");

  const extension = normalizedExtension(filePath);

  if (RAW_PHOTO_EXTENSIONS.has(extension)) {
    return "raw_photo";
  }
  if (PROCESSED_PHOTO_EXTENSIONS.has(extension)) {
    return "processed_photo";
  }
  if (RAW_VIDEO_EXTENSIONS.has(extension)) {
    return "raw_video";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (COLOR_LOG_EXTENSIONS.has(extension)) {
    return "color_log";
  }
  if (SIDECAR_EXTENSIONS.has(extension)) {
    return "sidecar";
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }

  return "unknown";
}

export function planShootIngest(input: PlanShootIngestInput): ShootIngestPlan {
  assertPlanShootIngestInput(input);

  const transferMode = input.transferMode ?? "copy";
  const sessionRoot = joinPosixPath(
    trimTrailingSlash(input.destinationRoot),
    input.shootDate.slice(0, 4),
    `${input.shootDate}-${slugify(input.projectSlug)}`,
  );
  const usedDestinationPaths = new Map<string, number>();
  const operations: IngestOperation[] = [];
  const manifestEntries: ManifestEntry[] = [];
  const warnings: string[] = [];

  if (transferMode === "move") {
    warnings.push(
      "Move requests are modeled as copy-verify-review; no delete operation will be generated automatically.",
    );
  }

  for (const file of input.files) {
    const kind = categorizeMediaFile(file.sourcePath);
    const destinationPath = allocateDestinationPath({
      fileName: basename(file.sourcePath),
      kind,
      sessionRoot,
      usedDestinationPaths,
    });

    operations.push({
      byteSize: file.byteSize,
      destinationPath,
      kind,
      sourcePath: file.sourcePath,
      type: "copy",
    });

    if (file.checksum !== undefined) {
      operations.push({
        checksum: file.checksum,
        destinationPath,
        sourcePath: file.sourcePath,
        type: "verify_checksum",
      });
    } else {
      warnings.push(
        `File ${file.sourcePath} is missing checksum evidence; keep the source mounted until manual verification completes.`,
      );
    }

    if (transferMode === "move") {
      operations.push({
        reason:
          "Source can only be archived or manually deleted after copy and verification are reviewed by a human.",
        sourcePath: file.sourcePath,
        type: "mark_source_reviewed",
      });
    }

    manifestEntries.push({
      byteSize: file.byteSize,
      ...(file.captureTime === undefined ? {} : { captureTime: file.captureTime }),
      ...(file.checksum === undefined ? {} : { checksum: file.checksum }),
      destinationPath,
      kind,
      sourcePath: file.sourcePath,
    });
  }

  return {
    manifestEntries,
    operations,
    sessionRoot,
    transferMode,
    warnings,
  };
}

function allocateDestinationPath(input: {
  fileName: string;
  kind: MediaKind;
  sessionRoot: string;
  usedDestinationPaths: Map<string, number>;
}): string {
  assertSafeFileName(input.fileName);

  const destinationDirectory = joinPosixPath(
    input.sessionRoot,
    ORIGINAL_KINDS.has(input.kind) ? "originals" : "reference",
    KIND_DIRECTORY[input.kind],
  );
  const parsedPath = path.posix.parse(input.fileName);
  const extension = parsedPath.ext;
  const stem = parsedPath.name || "untitled";

  for (let attempt = 1; attempt <= Number.MAX_SAFE_INTEGER; attempt += 1) {
    const candidateName = attempt === 1 ? input.fileName : `${stem}-${attempt}${extension}`;
    const candidatePath = joinPosixPath(destinationDirectory, candidateName);
    const destinationKey = candidatePath.toLowerCase();

    if (!input.usedDestinationPaths.has(destinationKey)) {
      input.usedDestinationPaths.set(destinationKey, attempt);
      return candidatePath;
    }
  }

  throw new Error(`Could not allocate a collision-safe destination for ${input.fileName}`);
}

function assertPlanShootIngestInput(input: PlanShootIngestInput): void {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("input must be an object");
  }

  assertNonEmptyString(input.destinationRoot, "destinationRoot");
  assertNonEmptyString(input.projectSlug, "projectSlug");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.shootDate)) {
    throw new TypeError("shootDate must use YYYY-MM-DD format");
  }

  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new TypeError("files must contain at least one media file candidate");
  }

  if (
    input.transferMode !== undefined &&
    input.transferMode !== "copy" &&
    input.transferMode !== "move"
  ) {
    throw new TypeError("transferMode must be copy or move");
  }

  for (const [index, file] of input.files.entries()) {
    assertNonEmptyString(file.sourcePath, `files[${index}].sourcePath`);
    assertSourcePathPointsToFile(file.sourcePath, `files[${index}].sourcePath`);
    if (!Number.isSafeInteger(file.byteSize) || file.byteSize < 0) {
      throw new TypeError(`files[${index}].byteSize must be a non-negative safe integer`);
    }
    if (file.checksum !== undefined) {
      assertNonEmptyString(file.checksum, `files[${index}].checksum`);
    }
    if (file.captureTime !== undefined) {
      assertNonEmptyString(file.captureTime, `files[${index}].captureTime`);
    }
  }
}

function assertNonEmptyString(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertSafeFileName(fileName: string): void {
  if (fileName === "." || fileName === ".." || fileName.includes("/")) {
    throw new TypeError("sourcePath must point to a file with a safe basename");
  }
}

function assertSourcePathPointsToFile(sourcePath: string, name: string): void {
  if (/[\\/]$/.test(sourcePath)) {
    throw new TypeError(`${name} must point to a file, not a directory`);
  }

  assertSafeFileName(basename(sourcePath));
}

function basename(filePath: string): string {
  const normalizedPath = filePath.replaceAll("\\", "/");
  return path.posix.basename(normalizedPath);
}

function joinPosixPath(...segments: string[]): string {
  return path.posix.join(...segments);
}

function normalizedExtension(filePath: string): string {
  const extension = path.posix.extname(filePath.replaceAll("\\", "/"));
  return extension.startsWith(".") ? extension.slice(1).toLowerCase() : extension.toLowerCase();
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length === 0 ? "untitled-shoot" : slug;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}
