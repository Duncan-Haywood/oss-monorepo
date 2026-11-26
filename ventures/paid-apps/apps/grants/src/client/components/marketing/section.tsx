// Layout helpers shared by the marketing sections (landing page only).
import { cn } from "@client/lib/cn";
import type * as React from "react";

/** Page-width container matching the public header/footer gutters. */
export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto max-w-6xl px-4 sm:px-6", className)} {...props} />;
}

/** Eyebrow + h2 + intro paragraph. `id` goes on the h2 so sections can use aria-labelledby. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
  align = "left",
  tone = "light",
  className,
}: {
  id: string;
  eyebrow?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  align?: "left" | "center";
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && (
        <p
          className={cn(
            "text-sm font-semibold uppercase tracking-wider",
            dark ? "text-accent-200" : "text-brand-700",
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2
        id={id}
        className={cn(
          "mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl",
          dark ? "text-white" : "text-neutral-900",
        )}
      >
        {title}
      </h2>
      {children && (
        <div
          className={cn(
            "mt-4 text-pretty text-lg leading-relaxed",
            dark ? "text-brand-100" : "text-neutral-600",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Rounded icon tile used on feature cards. */
export function IconTile({
  children,
  tone = "brand",
  className,
}: {
  children: React.ReactNode;
  tone?: "brand" | "accent" | "dark";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&_svg]:h-5 [&_svg]:w-5",
        tone === "brand" && "bg-brand-50 text-brand-700 ring-1 ring-brand-100",
        tone === "accent" && "bg-accent-50 text-accent-700 ring-1 ring-accent-200",
        tone === "dark" && "bg-white/10 text-accent-200 ring-1 ring-white/15",
        className,
      )}
    >
      {children}
    </span>
  );
}
