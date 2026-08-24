export default function PreviewLoading() {
  return (
    <section
      className="mx-auto max-w-5xl px-6 py-16 sm:py-20"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading preview…</span>
      <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
      <div className="mt-4 h-10 w-full max-w-2xl animate-pulse rounded bg-zinc-200" />
      <div className="mt-3 h-10 w-3/4 max-w-xl animate-pulse rounded bg-zinc-200" />
      <div className="mt-5 h-4 w-full max-w-xl animate-pulse rounded bg-zinc-200" />
      <div className="mt-3 h-4 w-2/3 max-w-md animate-pulse rounded bg-zinc-200" />
      <div className="mt-10 flex gap-4">
        <div className="h-11 w-40 animate-pulse rounded-full bg-zinc-200" />
        <div className="h-11 w-32 animate-pulse rounded-full bg-zinc-100" />
      </div>
    </section>
  );
}
