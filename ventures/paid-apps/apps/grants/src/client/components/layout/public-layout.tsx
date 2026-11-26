// OWNER: shell agent — marketing / auth / legal pages chrome.
import { Link, Outlet } from "@tanstack/react-router";
import { useMe } from "../../lib/session";
import { buttonClass, Toaster } from "../ui";
import { Logo } from "./brand";
import { HrefLink } from "./href-link";

const legalLinks = [
  ["terms", "Terms of Service"],
  ["privacy", "Privacy Policy"],
  ["data-use", "Data Use Policy"],
  ["refunds", "Refund Policy"],
] as const;

export function PublicLayout() {
  const me = useMe();
  const firstOrg = me.data?.memberships[0];
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm font-medium text-brand-800 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="rounded-md" aria-label="Grant Autopilot home">
            <Logo />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2 text-sm">
            {me.data ? (
              firstOrg ? (
                <HrefLink
                  href={`/orgs/${encodeURIComponent(firstOrg.orgId)}`}
                  className={buttonClass({ size: "sm" })}
                >
                  Open dashboard
                </HrefLink>
              ) : (
                <Link to="/onboarding" className={buttonClass({ size: "sm" })}>
                  Finish setup
                </Link>
              )
            ) : (
              <>
                <Link to="/login" className={buttonClass({ variant: "ghost", size: "sm" })}>
                  Sign in
                </Link>
                <Link to="/signup" className={buttonClass({ size: "sm" })}>
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 text-sm sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm space-y-2">
            <Logo />
            <p className="text-subtle">
              Grant applications for small nonprofits — drafted only from your own documents, and
              always reviewed by your people.
            </p>
          </div>
          <nav aria-label="Legal">
            <p className="mb-2 font-semibold text-strong">Legal</p>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-muted sm:grid-cols-1">
              {legalLinks.map(([doc, label]) => (
                <li key={doc}>
                  <Link
                    to="/legal/$doc"
                    params={{ doc }}
                    className="hover:text-brand-700 hover:underline"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="border-t border-line-subtle">
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-subtle sm:px-6">
            © {new Date().getFullYear()} Grant Autopilot · Built for small nonprofits and tribal
            organizations.
          </p>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
