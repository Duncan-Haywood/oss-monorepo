import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-50">Access Denied</h1>
        {/*
          Anyone can load this page, so it says that the address was refused
          without naming the addresses that would have been accepted.
        */}
        <p className="mt-4 text-zinc-400">
          The address you signed in with is not on this deployment&apos;s
          allowlist, so it cannot open these reports. Ask the owner to add it.
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
