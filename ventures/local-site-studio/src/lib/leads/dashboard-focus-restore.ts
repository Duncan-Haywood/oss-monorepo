/**
 * Element-id builders for restoring keyboard/screen-reader focus after an
 * inline dashboard row editor (operator notes, commerce catalog, inquiry
 * reply composer) closes.
 *
 * Each editor is an inline `<tr>`/`<div>` panel toggled open by a native
 * `<button>` that stays mounted for the row's whole lifetime; only the panel
 * (and the Save/Cancel/Close button inside it) unmounts on close. A
 * keyboard-only or screen-reader operator who activates that inner
 * Save/Cancel/Close button loses focus entirely when it's removed from the
 * DOM — the browser resets focus to `<body>` and the next Tab restarts from
 * the top of the page, with nothing announced. leads-client.tsx assigns
 * these ids to each row's toggle button and calls
 * `document.getElementById(id)?.focus()` after clearing the relevant
 * "currently editing" state, so focus lands back on the still-mounted
 * control that opened the panel instead of vanishing.
 *
 * Pure — no DOM access here, just the id strings, so the id contract itself
 * (open-button id must match what the close path looks up) is unit-testable
 * without a DOM testing library, consistent with this file's neighbor
 * dashboard-row-aria-labels.ts.
 */
export function leadNotesToggleElementId(slug: string): string {
  return `lead-notes-toggle-${slug}`;
}

export function leadCommerceToggleElementId(slug: string): string {
  return `lead-commerce-toggle-${slug}`;
}

export function inquiryReplyToggleElementId(inquiryId: string): string {
  return `inquiry-reply-toggle-${inquiryId}`;
}
