// Banner at the top of the app shell for one-click demo visitors (GET /api/me `isDemo: true`).
import { Info } from "lucide-react";
import { demoConfig, isDemoMe, productSignupHref } from "./demo-links";

export function DemoBanner({ me }: { me: unknown }) {
  if (!isDemoMe(me)) return null;
  return (
    <div
      role="note"
      aria-label="Demo"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-warning-200 bg-warning-50 px-4 py-2 text-sm text-warning-900 sm:px-6 lg:px-10"
    >
      <Info className="h-4 w-4 shrink-0" aria-hidden />
      <span>You're exploring a demo with an imagined charity. Data resets daily.</span>
      <a
        href={productSignupHref(demoConfig.productUrl)}
        className="font-medium text-warning-950 underline underline-offset-2 hover:no-underline"
      >
        Start your own →
      </a>
    </div>
  );
}
