import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="text-4xl">🤔</div>
      <h1 className="text-xl font-bold">Nothing here</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        That page doesn&apos;t exist.
      </p>
      <Link
        href="/app"
        className="mt-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-neutral-950"
      >
        Back to swiping
      </Link>
    </main>
  );
}
