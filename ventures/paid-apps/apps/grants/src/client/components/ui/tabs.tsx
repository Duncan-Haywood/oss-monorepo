// WAI-ARIA tabs: roving tabindex, Arrow/Home/End keys, controlled or uncontrolled.
// <Tabs defaultValue="a"><TabList><Tab value="a">A</Tab></TabList><TabPanel value="a">…</TabPanel></Tabs>
import * as React from "react";
import { cn } from "../../lib/cn";

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
}
const Ctx = React.createContext<TabsCtx | null>(null);
const useTabs = () => {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("Tab components must be used inside <Tabs>");
  return c;
};
const safe = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, "_");

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value ?? inner;
  const baseId = React.useId();
  const ctx = React.useMemo<TabsCtx>(
    () => ({
      value: current,
      setValue: (v) => {
        if (value === undefined) setInner(v);
        onValueChange?.(v);
      },
      baseId,
    }),
    [current, value, onValueChange, baseId],
  );
  return (
    <Ctx.Provider value={ctx}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabList({
  className,
  children,
  "aria-label": ariaLabel,
}: {
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
    );
    const idx = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (idx === -1) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === -1) return;
    e.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  };
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Tab({
  value,
  children,
  count,
  disabled,
  className,
}: {
  value: string;
  children: React.ReactNode;
  /** Optional numeric badge, e.g. open flags. */
  count?: number;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTabs();
  const selected = t.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${t.baseId}-tab-${safe(value)}`}
      aria-selected={selected}
      aria-controls={`${t.baseId}-panel-${safe(value)}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => t.setValue(value)}
      className={cn(
        "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-muted hover:border-line-strong hover:text-strong",
        className,
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
            selected ? "bg-brand-100 text-brand-800" : "bg-muted text-muted",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function TabPanel({
  value,
  children,
  className,
  keepMounted = false,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
  /** Keep the panel in the DOM (hidden) when inactive, preserving its state. */
  keepMounted?: boolean;
}) {
  const t = useTabs();
  const selected = t.value === value;
  if (!selected && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={`${t.baseId}-panel-${safe(value)}`}
      aria-labelledby={`${t.baseId}-tab-${safe(value)}`}
      hidden={!selected}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI-ARIA tabs pattern makes panels focusable
      tabIndex={0}
      className={cn("pt-4 focus-visible:outline-none", className)}
    >
      {children}
    </div>
  );
}

// shadcn-style aliases, for convenience.
export const TabsList = TabList;
export const TabsTrigger = Tab;
export const TabsContent = TabPanel;
