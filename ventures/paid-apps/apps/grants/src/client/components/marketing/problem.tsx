import type { LucideIcon } from "lucide-react";
import { CalendarClock, FileSearch, Files } from "lucide-react";
import { Container, IconTile, SectionHeading } from "./section";

const burdens: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FileSearch,
    title: "Finding grants that fit",
    body: "Searching listings, reading eligibility rules and deciding which opportunities are worth the effort can eat up hours before anyone writes a word.",
  },
  {
    icon: Files,
    title: "Rewriting the same story",
    body: "Every funder asks about your mission, numbers and outcomes a little differently. Someone has to dig the figures out of old reports and fit them to a new word limit.",
  },
  {
    icon: CalendarClock,
    title: "Keeping up afterward",
    body: "Deadlines, status checks, progress reports and thank-you notes all live in someone's head or inbox, and they're easy to miss in a busy month.",
  },
];

export function Problem() {
  return (
    <section aria-labelledby="problem-heading" className="bg-white">
      <Container className="py-16 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <SectionHeading
            id="problem-heading"
            eyebrow="The problem"
            title="Good work goes unfunded for lack of time"
          >
            <p>
              When grant writing is one of five jobs on someone's desk, a small team can usually
              manage only a few applications a year. Strong opportunities slip past, not because
              your work isn't worth funding, but because there aren't enough hours.
            </p>
            <p className="mt-4">
              Grant Autopilot takes on the searching, drafting and tracking, so you can apply more
              often without cutting corners on accuracy.
            </p>
          </SectionHeading>
          <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {burdens.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="flex gap-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-5 sm:flex-col lg:flex-row"
              >
                <IconTile tone="accent">
                  <Icon />
                </IconTile>
                <div>
                  <h3 className="font-semibold text-neutral-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
