import type { Metadata } from "next";
import Link from "next/link";
import { EaaEvidenceInquiry } from "@/components/marketing/eaa-evidence-inquiry";
import { brand } from "@/lib/brand";
import {
  EAA_EVIDENCE_ACCURACY,
  EAA_EVIDENCE_DOCS_PATH,
  EAA_EVIDENCE_JOB,
  EAA_EVIDENCE_PATH,
  eaaJobPriceRangeLabel,
  eaaPrecisionLabel,
  eaaRecallLabel,
  eaaRetestPriceRangeLabel,
} from "@/lib/pricing/eaa-evidence";
import { staticPageMetadata } from "@/lib/seo";
import { EaaPreauditChecklist } from "@/components/marketing/eaa-preaudit-checklist";

export const metadata: Metadata = staticPageMetadata({
  title: `Accessibility evidence — ${brand.name}`,
  description:
    "A dated record of what was tested, changed, and left open on an obligated EU shop. Not a compliance certificate.",
  path: EAA_EVIDENCE_PATH,
});

const steps = [
  {
    title: "Audit",
    body: "Automated pass plus model review of templates, checkout, and forms, mapped to WCAG 2.2 AA and ranked by whether a defect blocks a task or only degrades it.",
  },
  {
    title: "Fixes",
    body: "Reviewable theme changes on a staging copy. Nothing is applied to production without you.",
  },
  {
    title: "Manual verification",
    body: "A contractor tests the blocking paths with real assistive technology and signs a short report. This step is not optional and is not automated.",
  },
  {
    title: "Record",
    body: "A dated file listing what was tested, with what tool or AT, what changed, what remains open and why. You publish any accessibility statement under your own name.",
  },
];

export default function AccessibilityEvidencePage() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">
          Product line · {brand.name}
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
          {EAA_EVIDENCE_JOB.tagline}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
          Fixed-price accessibility work for EU shops that are actually inside the
          obligation — {eaaJobPriceRangeLabel()} for the job, {eaaRetestPriceRangeLabel()}{" "}
          to keep the record current. We sell evidence. We do not sell a certificate, an
          overlay, or the sentence &ldquo;you are compliant.&rdquo;
        </p>
        <p className="mt-4 max-w-2xl text-sm text-zinc-500">
          Paid checkout is not live. Stripe Price objects have not been created. The form
          below only opens an email.
        </p>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">What you receive</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {steps.map((step) => (
              <div key={step.title} className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-zinc-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">How this can be wrong</h2>
        <p className="mt-4 max-w-3xl text-zinc-600">
          Out of sample, precision is {eaaPrecisionLabel()} (over-reporting) and recall is{" "}
          {eaaRecallLabel()} (under-reporting), measured {EAA_EVIDENCE_ACCURACY.measuredDate}{" "}
          on {EAA_EVIDENCE_ACCURACY.corpusPages} pages of {EAA_EVIDENCE_ACCURACY.measuredOn}.
          Those figures are a floor on this engine, not a promise about your shop.
        </p>
        <p className="mt-4 max-w-3xl text-zinc-600">
          {EAA_EVIDENCE_ACCURACY.operatorConflict}. That is why the rates sit on this page,
          not in a footnote.
        </p>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">Who this is for</h2>
          <p className="mt-4 text-zinc-600">
            Shops with at least 10 employees or more than €2 million turnover — the segment
            the European Accessibility Act actually obligates. A shop under both of those
            lines is typically exempt. We will not take that inquiry as an evidence job.
          </p>
          <EaaEvidenceInquiry />
          <EaaPreauditChecklist />
          <p className="mt-8 text-sm text-zinc-500">
            Operator notes live at{" "}
            <Link href={EAA_EVIDENCE_DOCS_PATH} className="underline underline-offset-2">
              {EAA_EVIDENCE_DOCS_PATH}
            </Link>
            . Website bundles stay at{" "}
            <Link href="/#pricing" className="underline underline-offset-2">
              pricing
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
