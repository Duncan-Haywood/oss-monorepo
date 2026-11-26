// Tooltip, Popover (citation hovers) and dropdown Menu. Rendered in a portal with fixed positioning
// so they are never clipped by overflow containers (tables, scroll areas).
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

export type Side = "top" | "bottom";
export type Align = "start" | "center" | "end";

function useFloatingPosition(
  anchorRef: React.RefObject<HTMLElement | null>,
  floatingRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  side: Side,
  align: Align,
) {
  const [style, setStyle] = React.useState<React.CSSProperties>({
    position: "fixed",
    top: -9999,
    left: -9999,
  });
  React.useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const f = floatingRef.current;
      if (!a || !f) return;
      const fw = f.offsetWidth;
      const fh = f.offsetHeight;
      const gap = 6;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let s: Side = side;
      if (s === "top" && a.top - fh - gap < 4 && a.bottom + fh + gap < vh) s = "bottom";
      if (s === "bottom" && a.bottom + fh + gap > vh - 4 && a.top - fh - gap > 0) s = "top";
      const top = s === "top" ? a.top - fh - gap : a.bottom + gap;
      let left =
        align === "start" ? a.left : align === "end" ? a.right - fw : a.left + a.width / 2 - fw / 2;
      left = Math.max(8, Math.min(left, vw - fw - 8));
      setStyle({ position: "fixed", top, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, side, align, anchorRef, floatingRef]);
  return style;
}

type TriggerProps = {
  ref?: React.Ref<HTMLElement>;
  "aria-describedby"?: string;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-haspopup"?: "dialog" | "menu" | "true";
  onClick?: React.MouseEventHandler;
  onKeyDown?: React.KeyboardEventHandler;
};

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const r of refs) {
      if (typeof r === "function") r(node);
      else if (r && typeof r === "object") (r as React.RefObject<T | null>).current = node;
    }
  };
}

/** Short text hint on hover/focus. The child must be a focusable element (button, link). */
export function Tooltip({
  content,
  children,
  side = "top",
  delay = 250,
}: {
  content: React.ReactNode;
  children: React.ReactElement<TriggerProps>;
  side?: Side;
  delay?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const anchorRef = React.useRef<HTMLElement | null>(null);
  const floatRef = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const style = useFloatingPosition(anchorRef, floatRef, open, side, "center");
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  React.useEffect(() => () => clearTimeout(timer.current), []);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  const childRef = (children.props as TriggerProps).ref;
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper only forwards hover/focus to the real control */}
      <span
        className="inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={() => {
          clearTimeout(timer.current);
          setOpen(true);
        }}
        onBlur={hide}
      >
        {React.cloneElement(children, {
          ref: mergeRefs(childRef, anchorRef),
          "aria-describedby": open ? id : undefined,
        })}
      </span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={floatRef}
            id={id}
            role="tooltip"
            style={style}
            className="pointer-events-none z-[70] max-w-xs animate-fade-in rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs leading-snug text-white shadow-overlay"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Rich floating panel anchored to `trigger`. Click toggles; with `openOnHover` it also opens on
 * hover/focus (good for citation chips). Closes on Esc and outside click; Esc returns focus.
 */
export function Popover({
  trigger,
  children,
  side = "bottom",
  align = "start",
  openOnHover = false,
  open: openProp,
  onOpenChange,
  className,
  label,
}: {
  trigger: React.ReactElement<TriggerProps>;
  children: React.ReactNode;
  side?: Side;
  align?: Align;
  openOnHover?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /** Accessible name for the panel. */
  label?: string;
}) {
  const [inner, setInner] = React.useState(false);
  const open = openProp ?? inner;
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (openProp === undefined) setInner(v);
      onOpenChange?.(v);
    },
    [openProp, onOpenChange],
  );
  const id = React.useId();
  const anchorRef = React.useRef<HTMLElement | null>(null);
  const floatRef = React.useRef<HTMLDivElement>(null);
  const hoverTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const style = useFloatingPosition(anchorRef, floatRef, open, side, align);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || floatRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        anchorRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);
  React.useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const hoverHandlers = openOnHover
    ? {
        onMouseEnter: () => {
          clearTimeout(hoverTimer.current);
          hoverTimer.current = setTimeout(() => setOpen(true), 150);
        },
        onMouseLeave: () => {
          clearTimeout(hoverTimer.current);
          hoverTimer.current = setTimeout(() => setOpen(false), 200);
        },
      }
    : {};

  const childProps = trigger.props as TriggerProps;
  return (
    <>
      <span className="inline-flex" {...hoverHandlers}>
        {React.cloneElement(trigger, {
          ref: mergeRefs(childProps.ref, anchorRef),
          "aria-expanded": open,
          "aria-controls": open ? id : undefined,
          "aria-haspopup": "dialog",
          onClick: (e: React.MouseEvent) => {
            childProps.onClick?.(e);
            setOpen(!open);
          },
        })}
      </span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={floatRef}
            id={id}
            role="dialog"
            aria-label={label}
            style={style}
            {...hoverHandlers}
            className={cn(
              "z-[65] w-80 max-w-[calc(100vw-1rem)] animate-scale-in rounded-lg border border-line bg-elevated p-4 text-sm text-default shadow-overlay",
              className,
            )}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

export interface MenuItem {
  label: React.ReactNode;
  onSelect: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Marks the current choice (e.g. active org) */
  selected?: boolean;
}

function focusMenuItem(menu: HTMLElement | null, which: "first" | "last" | number) {
  const els = Array.from(
    menu?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not([disabled])') ?? [],
  );
  if (!els.length) return;
  const idx = els.indexOf(document.activeElement as HTMLButtonElement);
  const n =
    which === "first"
      ? 0
      : which === "last"
        ? els.length - 1
        : (idx + which + els.length) % els.length;
  els[n]?.focus();
}

/** Dropdown menu with keyboard support (Arrow keys, Home/End, Esc, Tab closes). */
export function Menu({
  trigger,
  items,
  header,
  align = "end",
  side = "bottom",
  className,
  label,
}: {
  trigger: React.ReactElement<TriggerProps>;
  items: (MenuItem | "separator")[];
  header?: React.ReactNode;
  align?: Align;
  side?: Side;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const anchorRef = React.useRef<HTMLElement | null>(null);
  const floatRef = React.useRef<HTMLDivElement>(null);
  const style = useFloatingPosition(anchorRef, floatRef, open, side, align);

  const focusItem = (which: "first" | "last" | number) => focusMenuItem(floatRef.current, which);

  React.useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => focusMenuItem(floatRef.current, "first"));
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || floatRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) anchorRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem("first");
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem("last");
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const childProps = trigger.props as TriggerProps;
  return (
    <>
      {React.cloneElement(trigger, {
        ref: mergeRefs(childProps.ref, anchorRef),
        "aria-expanded": open,
        "aria-controls": open ? id : undefined,
        "aria-haspopup": "menu",
        onClick: (e: React.MouseEvent) => {
          childProps.onClick?.(e);
          setOpen(!open);
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          childProps.onKeyDown?.(e);
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        },
      })}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={floatRef}
            id={id}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            style={style}
            onKeyDown={onMenuKey}
            className={cn(
              "z-[65] min-w-56 max-w-[calc(100vw-1rem)] animate-scale-in rounded-lg border border-line bg-elevated py-1 text-sm shadow-overlay outline-none",
              className,
            )}
          >
            {header && <div className="border-b border-line-subtle px-3 py-2">{header}</div>}
            {items.map((it, i) =>
              it === "separator" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: static list
                <hr key={i} className="my-1 border-line-subtle" />
              ) : (
                // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-checked is only set with role="menuitemradio"
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: static list
                  key={i}
                  type="button"
                  role={it.selected !== undefined ? "menuitemradio" : "menuitem"}
                  aria-checked={it.selected}
                  tabIndex={-1}
                  disabled={it.disabled}
                  onClick={() => {
                    close(false);
                    it.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left outline-none hover:bg-subtle focus:bg-muted disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
                    it.danger ? "text-danger-700" : "text-default",
                    it.selected && "font-medium text-brand-800",
                  )}
                >
                  {it.icon && (
                    <span aria-hidden className="text-neutral-400">
                      {it.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
