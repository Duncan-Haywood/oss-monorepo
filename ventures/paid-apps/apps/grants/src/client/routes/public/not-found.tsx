// OWNER: shell agent — router-level 404 (use as `defaultNotFoundComponent`).
import { Logo } from "@client/components/layout/brand";
import { NotFound } from "@client/components/layout/not-found";
import { Link } from "@tanstack/react-router";

export function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link to="/" aria-label="Grant Autopilot home">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <NotFound />
      </main>
    </div>
  );
}
