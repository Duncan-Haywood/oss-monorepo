export default function CheckoutSuccessLoading() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center" aria-busy="true" aria-live="polite">
      <span className="sr-only">Confirming payment…</span>
      <div className="mx-auto h-9 w-64 animate-pulse rounded bg-zinc-200" />
      <div className="mx-auto mt-3 h-4 w-full animate-pulse rounded bg-zinc-200" />
      <div className="mx-auto mt-2 h-4 w-5/6 animate-pulse rounded bg-zinc-200" />
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="h-12 w-40 animate-pulse rounded-full bg-zinc-200" />
        <div className="h-12 w-32 animate-pulse rounded-full bg-zinc-100" />
      </div>
    </main>
  );
}
