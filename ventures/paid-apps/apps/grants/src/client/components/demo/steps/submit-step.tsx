// Step 6: submit and follow up. The package (sections, attachments) with its SHA-256 fingerprint,
// computed in the browser from the exact package text, a simulated approval, the follow-up reminders
// that get scheduled, and the sign-up call to action.
import { Badge, Button, buttonClass } from "@client/components/ui";
import { formatCents } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { Link } from "@tanstack/react-router";
import {
  AlertOctagon,
  ArrowRight,
  BellRing,
  CheckCircle2,
  FileText,
  Fingerprint,
  Package,
  Send,
} from "lucide-react";
import * as React from "react";
import {
  DEMO_ATTACHMENTS,
  DEMO_DRAFT,
  DEMO_FOLLOWUPS,
  DEMO_OPPORTUNITIES,
  DEMO_ORG,
} from "../data";
import { type DraftState, type FactStatuses, openBlockers, packageText, sha256Hex } from "../model";

/** SHA-256 of `text`, recomputed whenever it changes. `undefined` while computing. */
function usePackageHash(text: string) {
  const [hash, setHash] = React.useState<string | null | undefined>(undefined);
  React.useEffect(() => {
    let live = true;
    setHash(undefined);
    sha256Hex(text).then(
      (h) => live && setHash(h),
      () => live && setHash(null),
    );
    return () => {
      live = false;
    };
  }, [text]);
  return hash;
}

export function SubmitStep({
  draft,
  statuses,
  submitted,
  onSubmit,
  onBackToDraft,
}: {
  draft: DraftState;
  statuses: FactStatuses;
  submitted: boolean;
  onSubmit: () => void;
  onBackToDraft: () => void;
}) {
  const opp = DEMO_OPPORTUNITIES.find((o) => o.id === "opp-trades");
  const blockers = openBlockers(draft, statuses);
  const text = packageText(draft, statuses);
  const hash = usePackageHash(text);
  const ready = blockers === 0;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-neutral-600">
        Once a person approves, the application is packaged and submitted. The package is saved
        exactly as sent, with a fingerprint that changes if a single character does, and the
        follow-up work is scheduled.
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="demo-package-title"
          className="rounded-xl border border-neutral-200 bg-white shadow-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-4">
            <h3
              id="demo-package-title"
              className="flex items-center gap-2 font-semibold text-neutral-900"
            >
              <Package className="h-4 w-4 text-brand-600" aria-hidden /> Submission package
            </h3>
            {submitted ? (
              <Badge tone="success" dot>
                Submitted (simulated)
              </Badge>
            ) : ready ? (
              <Badge tone="brand" dot>
                Waiting for approval
              </Badge>
            ) : (
              <Badge tone="danger" dot>
                {blockers} open {blockers === 1 ? "blocker" : "blockers"}
              </Badge>
            )}
          </div>
          <div className="space-y-5 px-5 py-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Application
                </dt>
                <dd className="mt-0.5 font-medium text-neutral-900">{opp?.title}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Funder
                </dt>
                <dd className="mt-0.5 text-neutral-900">{opp?.funder}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Applicant
                </dt>
                <dd className="mt-0.5 text-neutral-900">{DEMO_ORG.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Requested
                </dt>
                <dd className="mt-0.5 text-neutral-900">{formatCents(opp?.askCents)}</dd>
              </div>
            </dl>
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Contents
              </h4>
              <ul className="mt-1.5 space-y-1 text-sm text-neutral-700">
                <li className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-neutral-400" aria-hidden />
                  Section: {DEMO_DRAFT.title} (every sentence cited)
                </li>
                {DEMO_ATTACHMENTS.map((a) => (
                  <li key={a} className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-neutral-400" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-neutral-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
                <Fingerprint className="h-3.5 w-3.5" aria-hidden /> Package fingerprint (SHA-256)
              </p>
              <p
                data-testid="package-hash"
                className="mt-1 break-all font-mono text-xs leading-relaxed text-neutral-800"
              >
                {hash === undefined
                  ? "Computing…"
                  : hash === null
                    ? "Your browser can't compute the fingerprint here."
                    : hash}
              </p>
              <p className="mt-1.5 text-xs text-neutral-500">
                Computed in your browser from the package text. Go back and change the draft, and it
                changes too.
              </p>
            </div>

            {submitted ? (
              <div
                role="status"
                className="flex gap-2.5 rounded-lg bg-success-50 p-3 text-sm text-success-900 ring-1 ring-success-200 ring-inset"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  Approved and submitted (simulated: nothing was sent). In the app you'd get a
                  confirmation email, and the package stays downloadable exactly as sent.
                </p>
              </div>
            ) : ready ? (
              <Button onClick={onSubmit}>
                <Send aria-hidden /> Approve &amp; submit (simulated)
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg bg-danger-50 p-3 text-sm text-danger-900 ring-1 ring-danger-200 ring-inset">
                <p className="flex gap-2">
                  <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  Approval stays disabled until every blocker in the draft is resolved.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled>
                    <Send aria-hidden /> Approve &amp; submit
                  </Button>
                  <Button size="sm" variant="secondary" onClick={onBackToDraft}>
                    Back to the draft review
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section
            aria-labelledby="demo-followups-title"
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card"
          >
            <h3
              id="demo-followups-title"
              className="flex items-center gap-2 font-semibold text-neutral-900"
            >
              <BellRing className="h-4 w-4 text-brand-600" aria-hidden /> Follow-up reminders
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              {submitted ? "Scheduled for after submission:" : "Scheduled once it's submitted:"}
            </p>
            <ol className="mt-3 space-y-3">
              {DEMO_FOLLOWUPS.map((f) => (
                <li key={f.kind} className="flex gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      submitted ? "bg-brand-500" : "bg-neutral-300",
                    )}
                  />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {f.kind} <span className="font-normal text-neutral-500">· {f.when}</span>
                    </p>
                    <p className="text-sm text-neutral-600">{f.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section
            aria-labelledby="demo-cta-title"
            className="rounded-xl bg-brand-900 p-6 text-white shadow-card"
          >
            <h3 id="demo-cta-title" className="text-lg font-semibold">
              That was {DEMO_ORG.shortName}. Now try it with your records.
            </h3>
            <p className="mt-2 text-sm text-brand-100">
              Your real account is built only from your own documents and interviews. Nothing from
              this demo carries over.
            </p>
            <Link
              to="/signup"
              className={buttonClass({
                size: "lg",
                variant: "secondary",
                className: "mt-4 border-transparent",
              })}
            >
              Start with your own organization <ArrowRight aria-hidden />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
