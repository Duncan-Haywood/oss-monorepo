// "See the demo" call to action for the landing page and marketing pages. Links to the public,
// no-sign-up demo at /demo (src/client/routes/marketing/demo.tsx).
//   <DemoCta />                    card with heading, copy and button (default)
//   <DemoCta variant="button" />   just the button, e.g. next to "Get started" in a hero
import { HrefLink } from "@client/components/layout/href-link";
import { buttonClass } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { FlaskConical, PlayCircle } from "lucide-react";
import { DEMO_PATH } from "./demo-meta";

export function DemoCta({
  variant = "card",
  headingLevel = "h2",
  className,
}: {
  variant?: "card" | "button";
  /** Heading level of the card's title, so it fits the page outline. */
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  if (variant === "button") {
    return (
      <HrefLink
        href={DEMO_PATH}
        className={buttonClass({ size: "lg", variant: "secondary", className })}
      >
        <PlayCircle aria-hidden />
        See the demo
      </HrefLink>
    );
  }
  const Heading = headingLevel;
  return (
    <aside
      aria-label="Interactive demo"
      className={cn(
        "flex flex-col gap-5 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-accent-50 p-6 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-8",
        className,
      )}
    >
      <div className="max-w-xl">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-700">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden /> No sign-up needed
        </p>
        <Heading className="mt-2 text-balance text-2xl font-semibold tracking-tight text-neutral-900">
          See it work on an imagined charity
        </Heading>
        <p className="mt-2 text-pretty text-neutral-600">
          Walk through six screens with a made-up trades-training nonprofit: documents become cited
          facts, grants are ranked, a draft is checked claim by claim, and a package is submitted.
        </p>
      </div>
      <HrefLink
        href={DEMO_PATH}
        className={buttonClass({ size: "lg", className: "self-start sm:self-auto" })}
      >
        <PlayCircle aria-hidden />
        See the demo
      </HrefLink>
    </aside>
  );
}
