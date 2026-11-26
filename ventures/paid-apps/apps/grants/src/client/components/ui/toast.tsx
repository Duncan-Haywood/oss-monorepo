// Toasts. A module-level store means `useToast()` / `toast()` work anywhere (even outside a provider);
// <Toaster/> (rendered by both layouts and by <ToastProvider>) displays them. Only one Toaster renders.
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { getOpenDialogCount, subscribeOpenDialogs } from "./dialog";

export type ToastTone = "success" | "error" | "info" | "warning";
export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** ms before auto-dismiss; 0 = sticky. Default 5000 (8000 for errors). */
  duration?: number;
  action?: { label: string; onClick: () => void };
}
export interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  emit();
}

function show(opts: ToastOptions): number {
  const id = nextId++;
  const tone = opts.tone ?? "info";
  // At most 3 on screen: a taller stack covers too much of the page (and of open dialogs).
  items = [...items.slice(-2), { ...opts, id, tone }];
  const duration = opts.duration ?? (tone === "error" ? 8000 : 5000);
  if (duration > 0)
    timers.set(
      id,
      setTimeout(() => dismiss(id), duration),
    );
  emit();
  return id;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e ?? "Unknown error"));

/** Imperative API, usable outside React (e.g. in mutation callbacks). */
export const toast = Object.assign(show, {
  success: (title: string, description?: string) => show({ title, description, tone: "success" }),
  error: (title: string, description?: unknown) =>
    show({
      title,
      description: description === undefined ? undefined : errorText(description),
      tone: "error",
    }),
  info: (title: string, description?: string) => show({ title, description, tone: "info" }),
  warning: (title: string, description?: string) => show({ title, description, tone: "warning" }),
  dismiss,
});

export function useToast() {
  return toast;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => items;

// Ensure only the first mounted Toaster renders.
const hosts: symbol[] = [];
const hostListeners = new Set<() => void>();

const toneStyle: Record<ToastTone, { icon: typeof Info; cls: string }> = {
  success: { icon: CheckCircle2, cls: "text-success-600" },
  error: { icon: AlertCircle, cls: "text-danger-600" },
  info: { icon: Info, cls: "text-brand-600" },
  warning: { icon: TriangleAlert, cls: "text-warning-600" },
};

export function Toaster() {
  const list = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // While a modal dialog is open its footer (primary action) sits at the bottom of the screen — and on
  // phones the dialog is a bottom sheet — so toasts move to the top instead of covering it.
  const dialogOpen =
    React.useSyncExternalStore(subscribeOpenDialogs, getOpenDialogCount, getOpenDialogCount) > 0;
  const [me] = React.useState(() => Symbol("toaster"));
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    hosts.push(me);
    const l = () => force();
    hostListeners.add(l);
    for (const h of hostListeners) h();
    return () => {
      hosts.splice(hosts.indexOf(me), 1);
      hostListeners.delete(l);
      for (const h of hostListeners) h();
    };
  }, [me]);
  if (hosts[0] !== me || typeof document === "undefined") return null;
  return createPortal(
    <section
      aria-label="Notifications"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[60] flex items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end",
        dialogOpen ? "top-0 flex-col-reverse" : "bottom-0 flex-col",
      )}
    >
      {list.map((t) => {
        const { icon: Icon, cls } = toneStyle[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            aria-live={t.tone === "error" ? "assertive" : "polite"}
            className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-lg border border-line bg-elevated p-4 shadow-overlay"
          >
            <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", cls)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-strong">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 break-words text-sm text-muted">{t.description}</p>
              )}
              {t.action && (
                <button
                  type="button"
                  className="mt-2 text-sm font-medium text-brand-700 hover:underline"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-m-1 rounded p-1 text-neutral-400 hover:bg-muted hover:text-default"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </section>,
    document.body,
  );
}

/** Optional: wrap the app to guarantee a Toaster is mounted. `useToast()` works without it. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
