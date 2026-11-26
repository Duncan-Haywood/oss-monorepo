// "Built to never make things up": mirrors the anti-fabrication design in docs/ARCHITECTURE.md
// (fact base, cited drafting, independent verification, flags, autopilot gates). Keep copy in sync.
import { cn } from "@client/lib/cn";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Hand,
  ListChecks,
  MessageCircleQuestion,
  MousePointerClick,
  Quote,
  SearchCheck,
  Zap,
} from "lucide-react";
import { Container, IconTile, SectionHeading } from "./section";

export const SAFEGUARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Quote,
    title: "Every fact has a source",
    body: "Each factual sentence links to the fact it relies on and the exact quote from your document or interview, so anyone can check it in seconds.",
  },
  {
    icon: BadgeCheck,
    title: "Only facts you've confirmed",
    body: "Facts pulled from your documents are suggestions until someone on your team confirms them. A draft that leans on an unconfirmed fact is flagged.",
  },
  {
    icon: SearchCheck,
    title: "A separate checker reads every claim",
    body: "After drafting, an independent check compares each claim with its sources and makes sure every number, date and dollar amount actually appears there.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Gaps become questions, not guesses",
    body: "When your records don't answer a funder's question, the draft leaves a gap and asks your team instead of filling it in.",
  },
];

export const REVIEW_TIERS: {
  icon: LucideIcon;
  name: string;
  when: string;
  body: string;
  emphasis?: boolean;
}[] = [
  {
    icon: ListChecks,
    name: "Full review",
    when: "Large requests, ones you're likely to win, or anything with unresolved flags",
    body: "Your team goes through the application section by section, with every flag and source in view.",
  },
  {
    icon: MousePointerClick,
    name: "One-click approval",
    when: "Most applications",
    body: "A clear summary with any open questions highlighted. Approve when you're satisfied, or open the full draft.",
    emphasis: true,
  },
  {
    icon: Zap,
    name: "Autopilot (optional)",
    when: "Small, low-risk requests that pass every check",
    body: "Only if an owner or admin turns it on and sets its limits, such as a maximum amount and a monthly cap. Anything flagged, unconfirmed or high-value still comes to you.",
  },
];

export function Trust() {
  return (
    <section
      id="accuracy"
      aria-labelledby="trust-heading"
      className="scroll-mt-20 bg-brand-950 text-white"
    >
      <Container className="py-16 lg:py-24">
        <SectionHeading
          id="trust-heading"
          tone="dark"
          eyebrow="Accuracy first"
          title="Built to never make things up"
        >
          <p>
            A grant application is a promise to a funder. Grant Autopilot only states facts your own
            records support, and it shows you exactly what has been checked and what hasn't.
          </p>
        </SectionHeading>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {SAFEGUARDS.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="flex gap-4 rounded-2xl bg-white/[0.04] p-6 ring-1 ring-inset ring-white/10"
            >
              <IconTile tone="dark">
                <Icon />
              </IconTile>
              <div>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-brand-100/90">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-16">
          <h3 className="text-xl font-semibold tracking-tight text-white">
            The right amount of human review for each application
          </h3>
          <p className="mt-2 max-w-2xl text-brand-100/90">
            Not every application needs the same attention. Each one is routed to a review level
            using thresholds your organization controls.
          </p>
          <ol className="mt-8 grid gap-4 lg:grid-cols-3">
            {REVIEW_TIERS.map(({ icon: Icon, name, when, body, emphasis }) => (
              <li
                key={name}
                className={cn(
                  "flex flex-col rounded-2xl p-6 ring-1 ring-inset",
                  emphasis
                    ? "bg-white text-neutral-900 ring-white"
                    : "bg-white/[0.04] ring-white/10",
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn("h-5 w-5", emphasis ? "text-brand-700" : "text-accent-200")}
                    aria-hidden
                  />
                  <h4 className={cn("font-semibold", emphasis ? "text-neutral-900" : "text-white")}>
                    {name}
                  </h4>
                </div>
                <p
                  className={cn(
                    "mt-3 text-sm font-medium",
                    emphasis ? "text-brand-800" : "text-accent-100",
                  )}
                >
                  {when}
                </p>
                <p
                  className={cn(
                    "mt-2 text-sm leading-relaxed",
                    emphasis ? "text-neutral-600" : "text-brand-100/90",
                  )}
                >
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10 flex flex-col gap-4 rounded-2xl bg-accent-50 p-6 text-neutral-900 sm:flex-row sm:items-center sm:p-8">
          <IconTile tone="accent" className="h-12 w-12 [&_svg]:h-6 [&_svg]:w-6">
            <Hand />
          </IconTile>
          <div>
            <p className="text-lg font-semibold">You approve before anything is sent.</p>
            <p className="mt-1 text-sm leading-relaxed text-neutral-700">
              That's the default for every organization. Autopilot stays off until an owner or admin
              turns it on, and you can turn it off again at any time.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
