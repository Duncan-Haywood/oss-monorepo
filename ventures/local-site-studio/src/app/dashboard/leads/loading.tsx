export default function LeadsLoading() {
  return (
    <main
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading lead pipeline…</span>
      <div className="h-9 w-64 animate-pulse rounded bg-zinc-200" />
      <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-zinc-200" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-zinc-200 px-4 py-3">
            <div className="h-3 w-20 animate-pulse rounded bg-zinc-200" />
            <div className="mt-2 h-6 w-14 animate-pulse rounded bg-zinc-200" />
          </div>
        ))}
      </div>
      <div className="mt-10 space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-14 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50"
          />
        ))}
      </div>
    </main>
  );
}
