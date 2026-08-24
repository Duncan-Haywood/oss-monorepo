export const PRINT_FILE_SPEC_ID = "print-atelier-floor-2026-08-24";
export const MIN_IMPLIED_DPI = 150;
export const PIXEL_FLOOR_SHORT_EDGE = 1500;
export const MAX_BYTES = 50 * 1024 * 1024;

const WEB_FILENAME_TOKENS = ["web", "thumbnail", "lowres", "instagram", "facebook"];
const PRINT_SIZES: Record<string, [number, number]> = {
  "5x7": [5, 7], "8x10": [8, 10], "11x14": [11, 14], "12x16": [12, 16],
  "16x20": [16, 20], "18x24": [18, 24], "24x36": [24, 36],
};

export type PreflightFinding = {
  rule: string;
  detail: string;
  severity: "blocking" | "degrading";
};

export type PreflightResult = {
  fileName: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  sizeToken: string | null;
  findings: PreflightFinding[];
};

export function preflightImage(file: Pick<File, "name" | "size" | "type">, width: number, height: number): PreflightResult {
  const format = file.type === "image/jpeg" ? "jpeg" : file.type === "image/png" ? "png" : file.type || "unknown";
  const findings: PreflightFinding[] = [];
  const sizeToken = findSizeToken(file.name);

  if (!["jpeg", "png"].includes(format)) {
    findings.push({ rule: "format", detail: `${format} is not JPEG or PNG`, severity: "blocking" });
  }
  if (file.size > MAX_BYTES) {
    findings.push({ rule: "byte_size", detail: `${formatBytes(file.size)} exceeds 50 MiB`, severity: "blocking" });
  }
  const webToken = WEB_FILENAME_TOKENS.find((token) => file.name.toLowerCase().includes(token));
  if (webToken) {
    findings.push({ rule: "web_filename", detail: `filename contains web-export token '${webToken}'`, severity: "blocking" });
  }
  if (sizeToken) {
    const [a, b] = PRINT_SIZES[sizeToken];
    const landscape = width / height > a / b;
    const inches = landscape ? [b, a] : [a, b];
    const dpi = Math.min(width / inches[0], height / inches[1]);
    if (dpi < MIN_IMPLIED_DPI) {
      findings.push({ rule: "implied_dpi", detail: `${Math.round(dpi)} DPI at ${sizeToken}; floor is ${MIN_IMPLIED_DPI} DPI`, severity: "blocking" });
    }
    const ratio = width / height;
    const expected = inches[0] / inches[1];
    if (Math.abs(ratio - expected) / expected > 0.04) {
      findings.push({ rule: "named_aspect", detail: `${width}x${height} does not match the ${sizeToken} crop`, severity: "degrading" });
    }
  } else if (Math.min(width, height) < PIXEL_FLOOR_SHORT_EDGE) {
    findings.push({ rule: "pixel_floor", detail: `short edge is ${Math.min(width, height)}px; floor is ${PIXEL_FLOOR_SHORT_EDGE}px`, severity: "blocking" });
  }

  return { fileName: file.name, format, bytes: file.size, width, height, sizeToken, findings };
}

function findSizeToken(name: string): string | null {
  const match = name.match(/(?<!\d)(\d{1,2})x(\d{1,2})(?!\d)/i);
  if (!match) return null;
  const token = `${Math.min(Number(match[1]), Number(match[2]))}x${Math.max(Number(match[1]), Number(match[2]))}`;
  return token in PRINT_SIZES ? token : null;
}

export function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MiB`;
}
