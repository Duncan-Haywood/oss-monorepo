// Prompt rendering for retrieved chunks (pure; shared by drafting, matching, interviews).
import type { RetrievedChunk } from "./index";

const headerSafe = (s: string) =>
  s
    .replace(/[[\]|\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

/**
 * Renders chunks as citeable prompt blocks: `[chk_id | doc title] text`, separated by blank lines,
 * never exceeding `maxChars` (the last block may be truncated with "…").
 */
export function formatChunksForPrompt(
  chunks: Pick<RetrievedChunk, "chunkId" | "documentTitle" | "text">[],
  maxChars: number,
): string {
  const SEP = "\n\n";
  const parts: string[] = [];
  let used = 0;
  for (const c of chunks) {
    const header = `[${c.chunkId} | ${headerSafe(c.documentTitle) || "Untitled"}] `;
    const body = c.text.trim().replace(/\n{3,}/g, "\n\n");
    const sep = parts.length ? SEP.length : 0;
    const room = maxChars - used - sep;
    if (header.length + body.length <= room) {
      parts.push(header + body);
      used += sep + header.length + body.length;
      continue;
    }
    // Truncate the last block if a meaningful slice fits, then stop.
    if (room - header.length >= 80)
      parts.push(`${header}${body.slice(0, room - header.length - 1)}…`);
    break;
  }
  return parts.join(SEP);
}
