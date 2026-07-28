"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { DomainState } from "@/lib/domainScheduler";
import { parsePerspective, type PerspectiveValue } from "@/lib/perspective";

/**
 * The anonymous session bundle in localStorage — which participant id backs
 * each domain, and which perspective they belong to. Four components read
 * it and three wrote it, each with their own copy of the key and their own
 * idea of what a valid bundle looks like.
 *
 * It is exposed as a real external store (`useSyncExternalStore`) rather
 * than copied into component state inside an effect. Two reasons: reading
 * it during render removes a whole class of "renders empty, then flips"
 * bugs, and a write from one screen is seen immediately by every other
 * mounted screen instead of only after a navigation.
 */

export const SESSION_KEY = "survey:unified:session";

/**
 * `storage` only fires in OTHER tabs, so same-tab writers announce
 * themselves. Without this the profile screen could switch perspective and
 * a mounted runner would keep showing the old one.
 */
const CHANGED_EVENT = "quickpick:session-changed";

export type SessionDomain = { slug: string; title: string; kind: DomainState["kind"] };

export type SessionBundle = {
  firstName: string;
  perspective?: PerspectiveValue;
  participants: Record<string, string>;
  domains: SessionDomain[];
};

/**
 * A bundle is only usable if at least one domain has a participant id
 * behind it. A partial bundle left by a failed start would otherwise leave
 * the runner with nothing to fetch, spinning forever.
 */
export function parseSessionBundle(raw: string | null): SessionBundle | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const candidate = parsed as Partial<SessionBundle>;
  const participants = candidate.participants;
  const domains = candidate.domains;
  if (!participants || typeof participants !== "object") return null;
  if (!Array.isArray(domains) || domains.length === 0) return null;
  if (!domains.some((d) => d && typeof d.slug === "string" && typeof participants[d.slug] === "string")) {
    return null;
  }

  return {
    firstName: typeof candidate.firstName === "string" ? candidate.firstName : "",
    perspective: parsePerspective(candidate.perspective) ?? undefined,
    participants: participants as Record<string, string>,
    domains: domains as SessionDomain[],
  };
}

function emitChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function writeSessionBundle(bundle: SessionBundle): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(bundle));
  } catch {
    // Private-browsing quota errors must not take the swipe flow down; the
    // session still works for as long as the tab is open.
  }
  emitChanged();
}

export function clearSessionBundle(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* see writeSessionBundle */
  }
  emitChanged();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED_EVENT, onChange);
  };
}

/**
 * Returns the raw string so the snapshot is value-comparable. Returning a
 * freshly parsed object here would give React a new identity on every
 * render and loop forever.
 */
function getSnapshot(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/**
 * `undefined` — distinct from `null` — means "not known yet": the server
 * render and the hydration pass, where localStorage does not exist. Callers
 * show a neutral loading state for it rather than flashing "no session".
 */
function getServerSnapshot(): string | undefined {
  return undefined;
}

export function useSessionBundle(): SessionBundle | null | undefined {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => (raw === undefined ? undefined : parseSessionBundle(raw)), [raw]);
}
