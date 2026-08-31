import type { Metadata } from "next";
import { EaaPreauditChecklist } from "@/components/marketing/eaa-preaudit-checklist";
import { brand } from "@/lib/brand";
import { staticPageMetadata } from "@/lib/seo";

export const metadata: Metadata = staticPageMetadata({
  title: `EAA accessibility pre-audit checklist — ${brand.name}`,
  description: "Free accessibility evidence checklist for EU online shops preparing a dated EAA audit handoff.",
  path: "/accessibility-evidence/preaudit",
});

export default function EaaPreauditPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">Free EAA preparation tool</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900">Accessibility evidence pre-audit checklist</h1>
      <p className="mt-5 text-lg leading-8 text-zinc-600">
        Prepare the scope, critical journeys, test evidence, and open limitations before an accessibility review of an EU online shop.
      </p>
      <EaaPreauditChecklist />
      <p className="mt-8 text-sm leading-6 text-zinc-500">
        Everything runs in your browser. Checklist data is not uploaded. We count only anonymous feature events in local storage, never identity, IP, URLs, or checklist content. You can turn counting off above.
      </p>
    </main>
  );
}
