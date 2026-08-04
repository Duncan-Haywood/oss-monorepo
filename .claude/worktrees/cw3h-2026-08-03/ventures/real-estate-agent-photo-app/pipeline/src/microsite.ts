/**
 * microsite.ts — the "Brand" step of STRATEGY.md's 5-step workflow
 * (Guide -> Enhance -> Polish -> Deliver -> Brand): a single self-contained
 * HTML property microsite generated from an already-enhanced delivery
 * folder (pipeline/src/enhance.ts's output), plus agent contact info.
 *
 * Per process/mls-compliance.ts and the matching decisions-log.ts
 * guardrail, this must never modify or overwrite the delivered photo
 * files themselves (no watermarking the MLS-bound JPEGs) — it only reads
 * filenames from the delivery folder and writes one new index.html
 * alongside them. Branding (agent name/logo/headshot/contact) lives
 * entirely in that new file, not on the photos.
 */

import { readdir } from "node:fs/promises";
import { extname } from "node:path";

export const GALLERY_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export type MicrositeAgentInfo = {
  name: string;
  phone?: string;
  email?: string;
  brokerage?: string;
  /** Filename (relative to the delivery dir) of a headshot to feature. Never fabricated — omit if none exists. */
  headshotFilename?: string;
  /** Filename (relative to the delivery dir) of a logo to feature. Never fabricated — omit if none exists. */
  logoFilename?: string;
};

export type MicrositeOptions = {
  listingAddress: string;
  agent: MicrositeAgentInfo;
  tagline?: string;
};

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Lists gallery-eligible image filenames in a delivery dir, in the same
 * numeric-aware sort order enhance.ts's batchEnhance() writes them in,
 * excluding any files reserved for agent branding (headshot/logo).
 */
export async function listGalleryPhotos(
  deliveryDir: string,
  excludeFilenames: string[] = [],
): Promise<string[]> {
  const entries = await readdir(deliveryDir, { withFileTypes: true });
  const exclude = new Set(excludeFilenames);
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => GALLERY_EXTENSIONS.has(extname(name).toLowerCase()))
    .filter((name) => !exclude.has(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Builds the microsite HTML from a fixed list of photo filenames (relative paths, resolved next to the HTML file). */
export function buildMicrositeHtml(photoFilenames: string[], options: MicrositeOptions): string {
  const { listingAddress, agent, tagline } = options;
  const title = `${listingAddress} — Listing Lens`;

  const heroPhoto = photoFilenames[0];
  const galleryPhotos = photoFilenames.slice(1);

  const contactLines = [
    agent.brokerage ? escapeHtml(agent.brokerage) : null,
    agent.phone ? `<a href="tel:${escapeHtml(agent.phone)}">${escapeHtml(agent.phone)}</a>` : null,
    agent.email ? `<a href="mailto:${escapeHtml(agent.email)}">${escapeHtml(agent.email)}</a>` : null,
  ].filter((line): line is string => Boolean(line));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; }
  header { padding: 2rem 1.5rem 1rem; text-align: center; }
  header h1 { margin: 0 0 0.25rem; font-size: 1.75rem; }
  header p { margin: 0; color: #94a3b8; }
  .hero { width: 100%; max-height: 70vh; object-fit: cover; display: block; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.5rem; padding: 1rem; }
  .gallery img { width: 100%; height: 100%; object-fit: cover; border-radius: 0.5rem; }
  .agent-card { max-width: 480px; margin: 2rem auto; padding: 1.5rem; border-radius: 1rem; background: #1e293b; text-align: center; }
  .agent-card img.headshot { width: 96px; height: 96px; object-fit: cover; border-radius: 50%; margin-bottom: 0.75rem; }
  .agent-card img.logo { max-height: 40px; margin-bottom: 0.75rem; }
  .agent-card h2 { margin: 0 0 0.25rem; font-size: 1.1rem; }
  .agent-card p { margin: 0.25rem 0; color: #94a3b8; }
  .agent-card a { color: #38bdf8; text-decoration: none; }
  footer { text-align: center; padding: 1.5rem; color: #64748b; font-size: 0.8rem; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(listingAddress)}</h1>
  ${tagline ? `<p>${escapeHtml(tagline)}</p>` : ""}
</header>
${heroPhoto ? `<img class="hero" src="${escapeHtml(heroPhoto)}" alt="${escapeHtml(listingAddress)} — main photo">` : ""}
<div class="gallery">
${galleryPhotos.map((photo) => `  <img src="${escapeHtml(photo)}" alt="${escapeHtml(listingAddress)} photo">`).join("\n")}
</div>
<div class="agent-card">
  ${agent.logoFilename ? `<img class="logo" src="${escapeHtml(agent.logoFilename)}" alt="${escapeHtml(agent.brokerage ?? agent.name)} logo">` : ""}
  ${agent.headshotFilename ? `<img class="headshot" src="${escapeHtml(agent.headshotFilename)}" alt="${escapeHtml(agent.name)}">` : ""}
  <h2>${escapeHtml(agent.name)}</h2>
  ${contactLines.map((line) => `<p>${line}</p>`).join("\n  ")}
</div>
<footer>Listing media by Listing Lens</footer>
</body>
</html>
`;
}

export type GenerateMicrositeResult = {
  html: string;
  photoCount: number;
  photoFilenames: string[];
};

/** Reads a delivery folder's photos and builds the microsite HTML in one step. Never writes anything itself — see cli-microsite.ts for the file-writing entry point. */
export async function generateMicrositeForDelivery(
  deliveryDir: string,
  options: MicrositeOptions,
): Promise<GenerateMicrositeResult> {
  const exclude = [options.agent.headshotFilename, options.agent.logoFilename].filter(
    (name): name is string => Boolean(name),
  );
  const photoFilenames = await listGalleryPhotos(deliveryDir, exclude);
  const html = buildMicrositeHtml(photoFilenames, options);
  return { html, photoCount: photoFilenames.length, photoFilenames };
}
