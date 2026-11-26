import type { LucideIcon } from "lucide-react";
import { FileCheck2, Search, Send, Upload } from "lucide-react";
import { MoreLink } from "./page";
import { Container, SectionHeading } from "./section";
import { MARKETING_PATHS } from "./site-map";

export const HOW_IT_WORKS_STEPS: {
  icon: LucideIcon;
  title: string;
  body: string;
  detail: string;
}[] = [
  {
    icon: Upload,
    title: "Build your fact base",
    body: "Upload annual reports, budgets and past proposals, or answer a short guided interview by typing or speaking.",
    detail:
      "We pull out each fact with the exact quote it came from. Nothing counts as confirmed until someone on your team says so.",
  },
  {
    icon: Search,
    title: "Find grants that fit",
    body: "We check federal grant listings every day, and you can add any foundation opportunity by link or by uploading its request for proposals.",
    detail:
      "Each one is ranked by fit with your mission, location and programs, with the reasons and the deadline shown.",
  },
  {
    icon: FileCheck2,
    title: "Review a cited draft",
    body: "Drafts are written only from your fact base. Every factual sentence links to its source, and a separate check flags anything unsupported.",
    detail:
      "If a funder asks something your records don't answer, you get a short question instead of a made-up answer.",
  },
  {
    icon: Send,
    title: "Approve, submit, follow up",
    body: "Approve when you're satisfied. We send it where the funder accepts email, or give you a step-by-step guide for their portal or Grants.gov.",
    detail:
      "We keep an exact copy of what was submitted and remind you of every report and thank-you that follows.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20">
      <Container className="py-16 lg:py-24">
        <SectionHeading
          id="how-heading"
          eyebrow="How it works"
          title="Four steps, with your team in charge"
        >
          <p>
            Set up once with the documents you already have. After that, each new application starts
            from your own fact base, not a blank page.
          </p>
        </SectionHeading>
        <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS_STEPS.map(({ icon: Icon, title, body, detail }, i) => (
            <li
              key={title}
              className="relative flex flex-col rounded-2xl border border-neutral-200 bg-white p-6 shadow-card"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">
                  <span className="sr-only">Step </span>
                  {i + 1}
                </span>
                <Icon className="h-5 w-5 text-brand-600" aria-hidden />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-neutral-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{body}</p>
              <p className="mt-4 border-t border-neutral-100 pt-4 text-sm leading-relaxed text-neutral-500">
                {detail}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-8">
          <MoreLink to={MARKETING_PATHS.howItWorks}>See the full walkthrough</MoreLink>
        </p>
      </Container>
    </section>
  );
}
