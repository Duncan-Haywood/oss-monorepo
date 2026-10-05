import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-50">Access Denied</h1>
        <p className="mt-4 text-zinc-400">
          Your account is not on the allowlist. Only the owner&apos;s account
          can access these reports.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-xl bg-zinc-800 px-6 py-3 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
