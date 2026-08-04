/**
 * Restrict redirects to same-origin relative paths to prevent open redirects.
 */
export function sanitizeRedirectPath(
  path: string | null | undefined,
): string {
  if (!path) return "/";

  // Reject protocol-relative URLs (//evil.com) and absolute URLs
  if (!path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }

  // Reject backslash tricks and encoded variants
  if (path.includes("\\") || path.includes("%")) {
    return "/";
  }

  return path;
}
