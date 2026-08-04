"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * `null` where `matchMedia` isn't there to ask. That's the server render,
 * and also a handful of embedded webviews — neither should take the swipe
 * flow down over an animation preference.
 */
function reducedMotionQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : null;
}

function subscribeToReducedMotion(callback: () => void) {
  const mql = reducedMotionQuery();
  mql?.addEventListener("change", callback);
  return () => mql?.removeEventListener("change", callback);
}

/**
 * SSR-safe read of the OS-level "reduce motion" preference.
 *
 * Returns false for the server render and the hydrating render, then React
 * swaps in the real value — the same handoff `useSessionBundle` uses, and
 * the reason neither needs an effect.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => reducedMotionQuery()?.matches ?? false,
    () => false
  );
}
