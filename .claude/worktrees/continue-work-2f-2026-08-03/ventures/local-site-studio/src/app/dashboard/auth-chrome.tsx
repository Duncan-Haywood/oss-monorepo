import Link from "next/link";
import { logoutOperatorAction } from "@/app/dashboard/login/actions";
import { isOperatorAuthConfigured } from "@/lib/auth/operator";

type DashboardAuthChromeProps = {
  /** Optional query flag from redirects, e.g. auth=unconfigured */
  authNotice?: string | null;
};

export function DashboardAuthChrome({ authNotice }: DashboardAuthChromeProps) {
  const configured = isOperatorAuthConfigured();

  return (
    <div className="mb-6 space-y-3">
      {!configured || authNotice === "unconfigured" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Operator auth is <strong>not configured</strong> — dashboard is open. Set{" "}
          <code className="text-xs">OPERATOR_DASHBOARD_PASSWORD</code> before importing real
          leads or sending outreach.{" "}
          <Link href="/docs/launch-checklist" className="underline underline-offset-2">
            Launch checklist
          </Link>
        </p>
      ) : (
        <form action={logoutOperatorAction} className="flex justify-end">
          <button
            type="submit"
            className="text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
          >
            Sign out
          </button>
        </form>
      )}
    </div>
  );
}
