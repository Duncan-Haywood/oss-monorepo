export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading dashboard…</span>
      <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
      <div className="mt-4 h-9 w-56 animate-pulse rounded bg-zinc-200" />
      <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-zinc-200" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-zinc-200 px-4 py-3">
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-200" />
            <div className="mt-2 h-6 w-12 animate-pulse rounded bg-zinc-200" />
          </div>
        ))}
      </div>
    </main>
  );
}
