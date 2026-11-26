// Pure helpers for the triage inbox: keyboard map, active-item movement, reason selection.
import type { MatchReason } from "@shared/content";

export type TriageAction =
  | "next"
  | "prev"
  | "shortlist"
  | "dismiss"
  | "open"
  | "toggle"
  | "clear"
  | "help";

export interface Shortcut {
  action: TriageAction;
  /** Keys as KeyboardEvent.key values (first is the one shown). */
  keys: string[];
  /** aria-keyshortcuts value. */
  aria: string;
  label: string;
  /** Changes data: editors only. */
  write?: boolean;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { action: "next", keys: ["j", "ArrowDown"], aria: "j", label: "Next grant" },
  { action: "prev", keys: ["k", "ArrowUp"], aria: "k", label: "Previous grant" },
  { action: "shortlist", keys: ["s"], aria: "s", label: "Shortlist", write: true },
  { action: "dismiss", keys: ["d"], aria: "d", label: "Dismiss with a reason", write: true },
  { action: "open", keys: ["o"], aria: "o", label: "Open the full opportunity" },
  { action: "toggle", keys: ["x"], aria: "x", label: "Select or unselect for bulk actions" },
  { action: "clear", keys: ["Escape"], aria: "Escape", label: "Clear the selection" },
  { action: "help", keys: ["?"], aria: "Shift+?", label: "Show keyboard shortcuts" },
];

export const shortcutOf = (action: TriageAction): Shortcut =>
  SHORTCUTS.find((s) => s.action === action) as Shortcut;

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "number",
  "password",
  "tel",
  "url",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/** Keys typed into these belong to the field, not to the inbox. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || typeof (el as Element).tagName !== "string") return false;
  const e = el as HTMLElement;
  if (e.isContentEditable) return true;
  const tag = e.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUT_TYPES.has((e as HTMLInputElement).type || "text");
  return false;
}

/**
 * The inbox action for a key press, or null. Arrow keys only count while focus is in the list
 * (so they still scroll the page elsewhere). Ctrl/Meta/Alt combinations are left to the browser.
 */
export function actionForKey(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "target">,
  opts: { inList: boolean },
): TriageAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (isTypingTarget(e.target)) return null;
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !opts.inList) return null;
  for (const s of SHORTCUTS) if (s.keys.includes(e.key)) return s.action;
  return null;
}

/** Index after moving by `delta`, clamped to the list. */
export function moveIndex(current: number, delta: number, length: number): number {
  if (length === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return Math.max(0, Math.min(length - 1, current + delta));
}

/**
 * Which item becomes active once `removed` leave the list: the first remaining item after the
 * active one, else the closest before it, else null (inbox zero).
 */
export function nextActiveAfterRemoval(
  ids: readonly string[],
  activeId: string | null,
  removed: ReadonlySet<string>,
): string | null {
  const start = activeId ? Math.max(0, ids.indexOf(activeId)) : 0;
  for (let i = start; i < ids.length; i++) {
    const id = ids[i] as string;
    if (!removed.has(id)) return id;
  }
  for (let i = start - 1; i >= 0; i--) {
    const id = ids[i] as string;
    if (!removed.has(id)) return id;
  }
  return null;
}

/** The reasons shown in triage: the model lists them most important first. */
export function topReasons(reasons: readonly MatchReason[], n = 3): MatchReason[] {
  return reasons.slice(0, n);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
