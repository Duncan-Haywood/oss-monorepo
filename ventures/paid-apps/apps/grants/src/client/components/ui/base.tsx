// Core primitives: buttons, cards, form controls, badges, alerts, tables, page chrome.
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

/** Class string for a button look — apply to `<Link>`/`<a>` to get a link that looks like a button. */
export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:shrink-0",
    size === "xs" && "h-7 px-2 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5",
    size === "sm" && "h-8 px-3 text-sm [&_svg]:h-4 [&_svg]:w-4",
    size === "md" && "h-10 px-4 text-sm [&_svg]:h-4 [&_svg]:w-4",
    size === "lg" && "h-12 px-6 text-base [&_svg]:h-5 [&_svg]:w-5",
    size === "icon" && "h-9 w-9 [&_svg]:h-4 [&_svg]:w-4",
    variant === "primary" &&
      "bg-brand-600 text-white shadow-xs ring-1 ring-inset ring-brand-700/40 hover:bg-brand-700 active:bg-brand-800",
    variant === "secondary" &&
      "border border-line-strong bg-surface text-strong shadow-xs hover:border-neutral-400 hover:bg-subtle active:bg-muted",
    variant === "outline" &&
      "border border-brand-600/60 bg-surface text-brand-700 hover:border-brand-600 hover:bg-brand-50 active:bg-brand-100",
    variant === "ghost" && "text-default hover:bg-muted hover:text-strong",
    variant === "danger" &&
      "bg-danger-600 text-white shadow-xs hover:bg-danger-700 active:bg-danger-800",
    variant === "link" && "h-auto px-0 text-link underline-offset-4 hover:underline",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, className })}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-line bg-surface shadow-card", className)}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line-subtle px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}
/**
 * Card heading. Renders an <h2> by default because cards usually sit directly under the page's <h1>
 * (PageHeader); pass `as="h3"` (or h4) for a card nested inside another headed section.
 */
export function CardTitle({
  className,
  as: Tag = "h2",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }) {
  return (
    <Tag
      className={cn("text-base font-semibold tracking-tight text-strong", className)}
      {...props}
    />
  );
}
export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-line-subtle bg-subtle/60 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor
  return <label className={cn("block text-sm font-medium text-default", className)} {...props} />;
}

const fieldBase =
  "block w-full rounded-md border border-line-input bg-surface px-3 py-2 text-base text-strong shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-neutral-400 hover:border-neutral-500 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-600/20 disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-muted disabled:text-subtle aria-invalid:border-danger-600 aria-invalid:focus:ring-danger-600/20 sm:text-sm";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-10", className)} {...props} />;
}
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-24 leading-relaxed", className)} {...props} />;
}
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-10 pr-8", className)} {...props} />;
}

/** Styled native checkbox. Wrap with <label> or pair with <Label htmlFor>. */
export function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded border-line-input accent-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

/** Accessible on/off switch (role="switch"). */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label. If omitted, pass aria-label via `label` anyway for screen readers. */
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-brand-600" : "bg-neutral-400",
        )}
      >
        <span className="sr-only">{typeof label === "string" ? label : "Toggle"}</span>
        <span
          aria-hidden
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform",
            checked ? "translate-x-5.5" : "translate-x-0.5",
          )}
        />
      </button>
      {(label || description) && (
        <div className="text-sm">
          {label && (
            <label htmlFor={id} className="font-medium text-strong">
              {label}
            </label>
          )}
          {description && <p className="text-muted">{description}</p>}
        </div>
      )}
    </div>
  );
}

/** Label + control + hint/error, wired for accessibility. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger-600" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "accent";
export const toneClass: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  success: "bg-success-50 text-success-800 ring-success-200",
  warning: "bg-warning-50 text-warning-800 ring-warning-200",
  danger: "bg-danger-50 text-danger-800 ring-danger-200",
  info: "bg-info-50 text-info-800 ring-info-200",
  accent: "bg-accent-50 text-accent-800 ring-accent-200",
};
export const toneDotClass: Record<Tone, string> = {
  neutral: "bg-neutral-400",
  brand: "bg-brand-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
  info: "bg-info-500",
  accent: "bg-accent-500",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", toneDotClass[tone])} />}
      {children}
    </span>
  );
}

const alertIcon: Partial<Record<Tone, typeof Info>> = {
  info: Info,
  brand: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

/** Icon colour per tone (600 steps: >= 3:1 on white and on the tinted alert surface). */
const alertIconColor: Record<Tone, string> = {
  neutral: "text-neutral-500",
  brand: "text-brand-600",
  success: "text-success-600",
  warning: "text-warning-600",
  danger: "text-danger-600",
  info: "text-info-600",
  accent: "text-accent-600",
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = alertIcon[tone] ?? Info;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-lg px-4 py-3 text-sm ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", alertIconColor[tone])} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-muted", className)} role="status">
      <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden /> {label}…
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** A lucide icon element, e.g. <FileText />. */
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center sm:py-14",
        className,
      )}
    >
      {icon && (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-8 ring-brand-50/50 [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-strong">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small text above the title, e.g. a breadcrumb or section name. */
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-sm font-medium text-accent-700">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold text-strong sm:text-[1.75rem] sm:leading-9">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-3xl text-base text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    // `relative` makes the scroll box the containing block for absolutely positioned descendants
    // (e.g. `sr-only` header labels); without it they escape the overflow clip and widen the page.
    <div className="relative overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
      <table
        className={cn(
          "min-w-full divide-y divide-line text-sm [&_tbody]:divide-y [&_tbody]:divide-line-subtle [&_tbody_tr:nth-child(even)]:bg-subtle/70 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-brand-50/50",
          className,
        )}
        {...props}
      />
    </div>
  );
}
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope="col"
    className={cn(
      "bg-muted/70 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted",
      className,
    )}
    {...p}
  />
);
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-4 py-2.5 align-top text-default", className)} {...p} />
);

export function ErrorMessage({ error, title = "Error" }: { error: unknown; title?: string }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <Alert tone="danger" title={title}>
      {message}
    </Alert>
  );
}

/** Thin horizontal rule with optional centered label. */
export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) return <hr className={cn("border-line", className)} />;
  return (
    <div className={cn("flex items-center gap-3 text-xs text-subtle", className)}>
      <span className="h-px flex-1 bg-neutral-200" aria-hidden />
      <span>{label}</span>
      <span className="h-px flex-1 bg-neutral-200" aria-hidden />
    </div>
  );
}

/** Initials avatar. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800",
        className,
      )}
    >
      {initials}
    </span>
  );
}

/** Keyboard key hint. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "rounded border border-line-strong bg-subtle px-1.5 py-0.5 font-mono text-[0.7rem] text-muted",
        className,
      )}
      {...props}
    />
  );
}
