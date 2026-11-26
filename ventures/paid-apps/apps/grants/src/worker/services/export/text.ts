// Text hygiene shared by every export format: control-character stripping, XML/HTML escaping,
// dates and download filenames. Pure functions only.

/**
 * Characters that are illegal in XML 1.0 (C0 controls except TAB/LF/CR, U+FFFE/U+FFFF, unpaired
 * surrogates) plus DEL and the C1 controls, which Word and browsers render as garbage. With the
 * `u` flag the surrogate range only matches lone surrogates, so emoji and other astral characters
 * survive intact.
 */
const CONTROL_CHARS =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFE\uFFFF]|[\uD800-\uDFFF]/gu;

/** Normalizes line endings to \n and removes characters that cannot appear in XML/HTML text. */
export function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\r\n?/g, "\n").replace(CONTROL_CHARS, "");
}

const XML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/** Escapes text for XML element content and attribute values (also strips illegal characters). */
export function escapeXml(value: string): string {
  return cleanText(value).replace(/[&<>"']/g, (ch) => XML_ENTITIES[ch] ?? ch);
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string): string {
  return cleanText(value).replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch] ?? ch);
}

const LONG_DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

/** "December 1, 2026" (UTC, so a deadline stored at midnight UTC never shifts a day). */
export function formatLongDate(d: Date | null | undefined): string {
  return d ? LONG_DATE.format(d) : "Not announced";
}

/** Lowercase ASCII slug for filenames: "Año 2026: Need & Plan" -> "ano-2026-need-plan". */
export function slugify(value: string, maxLength = 60): string {
  const slug = cleanText(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLength).replace(/-+$/g, "");
}

/** A header-safe download filename (ASCII letters, digits and dashes only). */
export function exportFilename(
  parts: { orgName: string; title: string; versionNumber: number },
  extension: string,
): string {
  const stem = [slugify(parts.orgName, 40), slugify(parts.title, 60)].filter(Boolean).join("-");
  return `${stem || "application"}-v${parts.versionNumber}.${extension}`;
}
