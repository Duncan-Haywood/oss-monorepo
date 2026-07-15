import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isOperatorAuthConfigured,
  isOperatorAuthenticated,
} from "@/lib/auth/operator";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { brand } from "@/lib/brand";
import { loginOperatorAction } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function DashboardLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  // Same guard as loginOperatorAction — never trust startsWith("/") alone
  // (protocol-relative //evil.example is an open redirect for already-
  // authenticated visitors who hit /dashboard/login?next=...).
  const next = safeNextPath(params.next);

  if (!isOperatorAuthConfigured()) {
    redirect("/dashboard?auth=unconfigured");
  }

  if (await isOperatorAuthenticated()) {
    redirect(next);
  }

  const invalid = params.error === "invalid";
  const rateLimited = params.error === "rate_limited";

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm text-zinc-500">
        <Link href="/" className="underline underline-offset-2">
          {brand.name}
        </Link>
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        Operator sign-in
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Protects the lead pipeline, CSV import, and outreach stage changes. Set{" "}
        <code className="text-xs">OPERATOR_DASHBOARD_PASSWORD</code> in the environment.
      </p>

      {rateLimited ? (
        <p
          className="mt-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800"
          role="alert"
        >
          Too many attempts. Please wait before signing in again.
        </p>
      ) : invalid ? (
        <p
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          Incorrect password. Try again.
        </p>
      ) : null}

      <form action={loginOperatorAction} className="mt-8 space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium text-zinc-800">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Sign in
        </button>
      </form>

      <p className="mt-8 text-xs text-zinc-500">
        See{" "}
        <Link href="/docs/launch-checklist" className="underline underline-offset-2">
          launch checklist
        </Link>{" "}
        for production setup.
      </p>
    </main>
  );
}
