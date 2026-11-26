// Tiny dependency-free tour engine (coach marks). A tour is a list of steps, each pointing at an element
// marked `data-tour="<target>"`. The current target gets a spotlight ring and an anchored popover:
// role="dialog" + aria-modal, focus trapped inside, Esc closes, Back/Next, and "Don't show again".
// Steps whose target isn't on the page are skipped, so tours survive layout changes.
//
// <TakeTourButton tour={…} /> goes in a page header: it renders "Take the tour" and auto-starts the
// tour once per user (localStorage, see storage.ts). Pages only need the data-tour attributes.
import { useMe } from "@client/lib/session";
import { Compass, X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { Button, Card, useFocusTrap } from "../ui";
import { guideKeys, readGuidePref, writeGuidePref } from "./storage";

export interface TourStep {
  /** Value of the target's `data-tour` attribute. */
  target: string;
  title: string;
  body: string;
}

export interface TourDef {
  id: string;
  /** Accessible name for the tour, e.g. "Fact base tour". */
  title: string;
  steps: readonly TourStep[];
}

export type TourEndReason = "finished" | "closed" | "never";

export const tourSelector = (target: string) => `[data-tour="${CSS.escape(target)}"]`;

function findTarget(target: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(tourSelector(target));
}

type Rect = { top: number; left: number; width: number; height: number };

function useTargetRect(el: HTMLElement | null): Rect | null {
  const [rect, setRect] = React.useState<Rect | null>(null);
  React.useLayoutEffect(() => {
    if (!el) {
      setRect(null);
      return;
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [el]);
  return rect;
}

const PANEL_W = 320;
const GAP = 12;

function panelPosition(rect: Rect | null): React.CSSProperties {
  if (!rect || typeof window === "undefined") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(rect.left, vw - PANEL_W - 8));
  const below = rect.top + rect.height + GAP;
  // Prefer below the target; flip above when there isn't room (~220px for the panel).
  if (below + 220 <= vh || rect.top < 240) return { top: Math.min(below, vh - 240), left };
  return { top: Math.max(8, rect.top - GAP), left, transform: "translateY(-100%)" };
}

/**
 * Controlled tour overlay. Renders nothing when `open` is false. `onEnd` receives why it ended:
 * "finished" (last step's Done), "closed" (Esc or ×) or "never" (Don't show again).
 */
export function Tour({
  tour,
  open,
  onEnd,
}: {
  tour: TourDef;
  open: boolean;
  onEnd: (reason: TourEndReason) => void;
}) {
  // Steps resolved against the page when the tour opens (missing targets are skipped).
  const [steps, setSteps] = React.useState<{ step: TourStep; el: HTMLElement | null }[]>([]);
  const [index, setIndex] = React.useState(0);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const primaryRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  const bodyId = React.useId();

  React.useLayoutEffect(() => {
    if (!open) return;
    const found = tour.steps
      .map((step) => ({ step, el: findTarget(step.target) }))
      .filter((s) => s.el !== null);
    // Nothing on the page to point at: still show the first step, centered.
    const first = tour.steps[0];
    setSteps(found.length > 0 ? found : first ? [{ step: first, el: null }] : []);
    setIndex(0);
  }, [open, tour]);

  const current = steps[index];
  const el = current?.el ?? null;
  const rect = useTargetRect(open ? el : null);
  const active = open && current !== undefined;

  useFocusTrap(panelRef, active, primaryRef);

  React.useEffect(() => {
    if (!active || !el) return;
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [active, el]);

  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onEnd("closed");
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [active, onEnd]);

  // Keep focus on the primary action when the step changes (the trap only focuses on activation).
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus on step change
  React.useEffect(() => {
    if (active) primaryRef.current?.focus();
  }, [index]);

  if (!active || typeof document === "undefined") return null;
  const last = index === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-tour-overlay="">
      {/* Spotlight: a ring around the target, and a dimmed page around it (pointer-transparent). */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-lg transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow:
              "0 0 0 3px var(--color-brand-500), 0 0 0 9999px color-mix(in oklch, var(--color-neutral-900) 45%, transparent)",
          }}
        />
      ) : (
        <div
          aria-hidden
          className="fixed inset-0"
          style={{ background: "color-mix(in oklch, var(--color-neutral-900) 45%, transparent)" }}
        />
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        aria-roledescription="tour"
        tabIndex={-1}
        style={{ ...panelPosition(rect), width: PANEL_W, maxWidth: "calc(100vw - 1rem)" }}
        className="fixed animate-scale-in"
      >
        <Card className="p-4 text-sm shadow-overlay">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-brand-700">
                {tour.title} · Step {index + 1} of {steps.length}
              </p>
              <h2 id={titleId} className="mt-0.5 font-semibold text-strong">
                {current.step.title}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-2 h-8 w-8"
              aria-label="Close tour"
              onClick={() => onEnd("closed")}
            >
              <X aria-hidden />
            </Button>
          </div>
          <p id={bodyId} className="mt-2 leading-relaxed text-default">
            {current.step.body}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="link" size="sm" onClick={() => onEnd("never")}>
              Don't show again
            </Button>
            <div className="ml-auto flex gap-2">
              {index > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setIndex((i) => i - 1)}>
                  Back
                </Button>
              )}
              <Button
                ref={primaryRef}
                size="sm"
                onClick={() => (last ? onEnd("finished") : setIndex((i) => i + 1))}
              >
                {last ? "Done" : "Next"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>,
    document.body,
  );
}

/** True once this user has finished, closed or opted out of the tour (so it won't auto-start). */
export function hasSeenTour(userId: string, tourId: string): boolean {
  return (
    readGuidePref(guideKeys.tourSeen(userId, tourId)) !== null ||
    readGuidePref(guideKeys.toursOptOut(userId)) !== null
  );
}

/**
 * Page-header button that starts the tour on demand, and auto-starts it once per user as soon as
 * the first target is on the page (pages render their content after data loads, so it waits up to
 * `waitMs`). Ending the tour in any way records it; "Don't show again" stops all automatic tours.
 */
export function TakeTourButton({
  tour,
  autoStart = true,
  waitMs = 6000,
}: {
  tour: TourDef;
  autoStart?: boolean;
  waitMs?: number;
}) {
  const me = useMe();
  const userId = me.data?.user.id ?? null;
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!autoStart || !userId || hasSeenTour(userId, tour.id)) return;
    const targets = tour.steps.map((s) => s.target);
    const ready = () => targets.some((t) => findTarget(t) !== null);
    if (ready()) {
      setOpen(true);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (ready()) {
        window.clearInterval(timer);
        setOpen(true);
      } else if (Date.now() - started > waitMs) {
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [autoStart, userId, tour, waitMs]);

  const onEnd = React.useCallback(
    (reason: TourEndReason) => {
      setOpen(false);
      if (!userId) return;
      writeGuidePref(guideKeys.tourSeen(userId, tour.id), reason);
      if (reason === "never") writeGuidePref(guideKeys.toursOptOut(userId), "1");
    },
    [userId, tour.id],
  );

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Compass aria-hidden />
        Take the tour
      </Button>
      <Tour tour={tour} open={open} onEnd={onEnd} />
    </>
  );
}
