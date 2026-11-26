import { buttonClass } from "@client/components/ui";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { DraftPreview } from "./draft-preview";
import { GUARANTEE_DAYS, startingPrice } from "./plan-copy";
import { Container } from "./section";

const promises = [
  "Every fact cites your own documents",
  "Anything unverified is flagged",
  "Nothing is sent until you approve it",
];

export function Hero() {
  const from = startingPrice();
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden border-b border-neutral-200 bg-gradient-to-b from-brand-50 via-white to-white"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent"
      />
      <Container className="grid items-center gap-14 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:pb-24">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-800 shadow-card ring-1 ring-brand-100">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
            For small nonprofits and tribal organizations
          </p>
          <h1
            id="hero-heading"
            className="mt-6 text-balance text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]"
          >
            Apply for more grants with the team you already have.
          </h1>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-neutral-600">
            Grant Autopilot finds grants that fit your mission and drafts the applications using
            only what's in your own documents and interviews. Every fact shows where it came from,
            anything it can't verify is flagged, and your team decides what gets sent.
          </p>
          <ul className="mt-6 space-y-2 text-neutral-700">
            {promises.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <Check className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/signup" className={buttonClass({ size: "lg" })}>
              Get started
              <ArrowRight aria-hidden />
            </Link>
            <a href="#how-it-works" className={buttonClass({ size: "lg", variant: "secondary" })}>
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-neutral-500">
            {from ? `Plans from ${from} a month · ` : ""}
            {GUARANTEE_DAYS}-day money-back guarantee ·{" "}
            <Link to="/login" className="font-medium text-brand-700 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
        <DraftPreview className="mx-auto w-full max-w-md lg:max-w-none" />
      </Container>
    </section>
  );
}
