// Privacy promise: summarizes docs/legal/data-use.md and privacy.md. Keep copy in sync with them.
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Ban, Building2, Download, EyeOff, Lock, Trash2 } from "lucide-react";
import { MoreLink } from "./page";
import { Container, IconTile, SectionHeading } from "./section";
import { MARKETING_PATHS } from "./site-map";

const promises: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Lock,
    title: "Used only for your applications",
    body: "Your documents and interviews build your fact base, match you to grants and draft your applications. Nothing else.",
  },
  {
    icon: Building2,
    title: "Never shared with other organizations",
    body: "Every file, search index and record is kept separate per organization and checked on every request. Your past proposals are never used as examples for anyone else.",
  },
  {
    icon: Ban,
    title: "Never used to train AI",
    body: "Not our models and not our providers'. We use Anthropic's commercial API, which does not train on your inputs or outputs.",
  },
  {
    icon: EyeOff,
    title: "Sensitive details stay out of drafts",
    body: "Mark facts about the people you serve as restricted, and they are never sent to the AI when writing applications.",
  },
  {
    icon: Download,
    title: "Export everything, any time",
    body: "Owners and admins can download a full export of your data, including your original files.",
  },
  {
    icon: Trash2,
    title: "Deletion means deletion",
    body: "Delete your organization and its files, search entries and records are permanently removed, not just hidden.",
  },
];

export function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-heading" className="scroll-mt-20 bg-white">
      <Container className="py-16 lg:py-24">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading id="privacy-heading" eyebrow="Privacy" title="Your data stays yours">
            <p>
              You're trusting us with your organization's history. We use it to help you, and for
              nothing else. We never sell it or use it for advertising.
            </p>
          </SectionHeading>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            <MoreLink to={MARKETING_PATHS.trust}>Security &amp; privacy details</MoreLink>
            <Link
              to="/legal/$doc"
              params={{ doc: "data-use" }}
              className="inline-flex items-center gap-1 text-brand-700 hover:underline"
            >
              Data Use Policy <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/legal/$doc"
              params={{ doc: "privacy" }}
              className="inline-flex items-center gap-1 text-brand-700 hover:underline"
            >
              Privacy Policy <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
        <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {promises.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <IconTile>
                <Icon />
              </IconTile>
              <div>
                <h3 className="font-semibold text-neutral-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
