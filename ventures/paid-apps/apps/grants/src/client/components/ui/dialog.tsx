// Accessible modal dialog: portal, focus trap, Esc to close, focus restore, scroll lock.
import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { Button, Input } from "./base";

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

/** Trap Tab focus inside `ref` while `active`; restore focus to the previously focused element after. */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  initialFocusRef?: React.RefObject<HTMLElement | null>,
) {
  React.useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = initialFocusRef?.current ?? getFocusable(root)[0] ?? root;
    first.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = getFocusable(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const firstEl = items[0] as HTMLElement;
      const lastEl = items[items.length - 1] as HTMLElement;
      const current = document.activeElement;
      if (e.shiftKey && (current === firstEl || !root.contains(current))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (current === lastEl || !root.contains(current))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && typeof previous.focus === "function" && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [active, ref, initialFocusRef]);
}

let scrollLocks = 0;
let scrollLockPrev = "";
/** Locks page scrolling while `active` (nested locks are counted). Used by Dialog and the nav drawer. */
export function useScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    if (scrollLocks === 0) scrollLockPrev = document.body.style.overflow;
    scrollLocks++;
    document.body.style.overflow = "hidden";
    return () => {
      scrollLocks--;
      if (scrollLocks === 0) document.body.style.overflow = scrollLockPrev;
    };
  }, [active]);
}

// Number of open modal dialogs. The Toaster subscribes so toasts move away from dialog footers
// (where the primary action lives) instead of covering them.
let openDialogs = 0;
const openDialogListeners = new Set<() => void>();
export function subscribeOpenDialogs(listener: () => void) {
  openDialogListeners.add(listener);
  return () => {
    openDialogListeners.delete(listener);
  };
}
export const getOpenDialogCount = () => openDialogs;
function useRegisterOpenDialog(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    openDialogs++;
    for (const l of openDialogListeners) l();
    return () => {
      openDialogs--;
      for (const l of openDialogListeners) l();
    };
  }, [active]);
}

export type DialogSize = "sm" | "md" | "lg" | "xl";
const sizeClass: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  initialFocusRef,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons row, right-aligned. */
  footer?: React.ReactNode;
  size?: DialogSize;
  /** When false, Esc / backdrop click do not close (e.g. while saving). */
  dismissible?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();
  useFocusTrap(panelRef, open, initialFocusRef);
  useScrollLock(open);
  useRegisterOpenDialog(open);

  React.useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        aria-hidden
        className="absolute inset-0 animate-fade-in bg-neutral-900/50 backdrop-blur-[1px]"
        onMouseDown={() => dismissible && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[90dvh] w-full animate-scale-in flex-col rounded-t-xl bg-elevated shadow-overlay outline-none sm:rounded-xl",
          sizeClass[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-strong">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-subtle">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 rounded-md p-1 text-neutral-400 hover:bg-muted hover:text-default"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
        {children && (
          <div className="overflow-y-auto px-5 py-4 text-sm text-default">{children}</div>
        )}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle bg-subtle/60 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-xl sm:pb-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Two-button confirmation. Set `confirmText` to require typing a phrase (e.g. the org name). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  loading = false,
  confirmText,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => unknown;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  confirmText?: string;
}) {
  const [typed, setTyped] = React.useState("");
  const inputId = React.useId();
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const blocked = confirmText !== undefined && typed.trim() !== confirmText;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!loading}
      initialFocusRef={confirmText ? undefined : cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={() => void onConfirm()}
            loading={loading}
            disabled={blocked}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children || confirmText !== undefined ? (
        <>
          {children}
          {confirmText !== undefined && (
            <div className="mt-3 space-y-1.5">
              <label htmlFor={inputId} className="block text-sm text-default">
                Type <strong className="font-semibold text-strong">{confirmText}</strong> to confirm
              </label>
              <Input
                id={inputId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}
        </>
      ) : undefined}
    </Dialog>
  );
}
