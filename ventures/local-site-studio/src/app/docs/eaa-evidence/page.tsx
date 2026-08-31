import type { Metadata } from "next";
import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";
import {
  EAA_EVIDENCE_ACCURACY,
  EAA_EVIDENCE_JOB,
  EAA_EVIDENCE_PATH,
  eaaJobPriceRangeLabel,
  eaaPrecisionLabel,
  eaaRecallLabel,
  eaaRetestPriceRangeLabel,
} from "@/lib/pricing/eaa-evidence";
import { docPageMetadata } from "@/lib/seo";

export const metadata: Metadata = docPageMetadata("/docs/eaa-evidence");

export default function EaaEvidenceDocPage() {
  return (
    <DocPage
      title="Accessibility evidence product line"
      subtitle={`Sold under ${brand.name} · fulfilled by ${brand.legalEntity} · not a new venture`}
      related={[
        { href: "/docs/product-bundles", label: "Product bundles" },
        { href: "/docs/business-model", label: "Business model" },
        { href: "/docs/compliance", label: "Compliance" },
        { href: EAA_EVIDENCE_PATH, label: "Public product page" },
      ]}
    >
      <p>
        Initiated 2026-08-24 from the pipeline&apos;s only <code>build-now</code> candidate
        (<code>eaa-remediation-pipeline</code>). Same buyer as the site bundles, same
        dashboard, no new <code>ventures/</code> directory. The public page is{" "}
        <DocLink href={EAA_EVIDENCE_PATH}>{EAA_EVIDENCE_PATH}</DocLink>.
      </p>

      <h2>What is sold</h2>
      <p>
        A fixed-price job ({eaaJobPriceRangeLabel()}) and an optional monitored re-test (
        {eaaRetestPriceRangeLabel()}). Deliverable is a dated evidence record: what was
        tested, with which tool or AT, what changed, what remains open. The customer
        publishes any accessibility statement under their own name.
      </p>
      <p>
        Checkout is <strong>not live</strong>.{" "}
        <code>{EAA_EVIDENCE_JOB.id}</code> has <code>checkoutLive: false</code> and no
        Stripe Price env vars. The public form only builds a mailto. Inventing a Price ID
        so the existing checkout route could charge this job would be a billing lie.
      </p>

      <h2>What is not sold</h2>
      <ul>
        <li>A compliance certificate, warranty, or overlay widget.</li>
        <li>
          EAA-deadline urgency to a microenterprise (fewer than 10 employees <em>and</em>{" "}
          turnover ≤ €2M). <code>qualifyEaaBuyer</code> refuses that inquiry rather than
          converting it.
        </li>
        <li>
          A clean-bill reading of &ldquo;no findings.&rdquo; The engine&apos;s own rates
          travel with the record.
        </li>
      </ul>

      <h2>Free pre-audit checklist</h2>
      <p>
        The public product page includes a browser-only checklist for recording scope, critical
        journeys, keyboard and assistive-technology checks, evidence, and open limitations. It
        saves checked items in <code>localStorage</code> on the visitor&apos;s device and can export
        a plain-text handoff. No checklist content, shop URL, or identity leaves the browser.
        Anonymous feature counts are also local-only and can be disabled by the visitor.
      </p>

      <h2>Accuracy, as printed to a buyer</h2>
      <p>
        Precision {eaaPrecisionLabel()}, recall {eaaRecallLabel()}, measured{" "}
        {EAA_EVIDENCE_ACCURACY.measuredDate} on {EAA_EVIDENCE_ACCURACY.corpusPages} pages of{" "}
        {EAA_EVIDENCE_ACCURACY.measuredOn}. Source of truth:{" "}
        <code>src/lib/pricing/eaa-evidence.ts</code>, pinned by{" "}
        <code>eaa-evidence.test.ts</code>. The probe that produced the figures is{" "}
        <code>portfolio/pipeline/probes/eaa-wcag-triage</code>.
      </p>
      <p>{EAA_EVIDENCE_ACCURACY.operatorConflict}.</p>

      <h2>First experiment, still open</h2>
      <ol>
        <li>Run the audit-and-fix pass against three real shop themes (not this repo).</li>
        <li>Price one contractor AT job against a real invoice, not an estimate.</li>
        <li>
          Offer the job to ten obligated shops. Kill if fewer than two take a paid audit,
          or if AT verification finds generated fixes close less than half of blocking
          issues.
        </li>
      </ol>
      <p>
        Steps 2 and 3 need a legal person and customer contact. This initiation only
        ships the catalog, the qualification gate, and the public surface so those steps
        have somewhere to land.
      </p>
    </DocPage>
  );
}
