// Markdown helpers for the downloadable reports (SSP, quality gap report).

/**
 * One GitHub-flavoured Markdown table cell. Backslashes are escaped first, then pipes, so a
 * user's "a\|b" stays inside its cell (escaping only the pipe would yield "a\\|b": an escaped
 * backslash followed by a bare pipe that ends the cell). Line breaks become spaces.
 */
export const markdownCell = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
