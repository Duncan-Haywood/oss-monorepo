import Link from "next/link";
import { brand } from "@/lib/brand";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center sm:py-32">
      <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
        404
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
        We couldn&rsquo;t find that page
      </h1>
      <p className="mt-4 text-lg leading-8 text-zinc-600">
        {`The link may be out of date, or the preview may not be live yet. Try the homepage, or ${
          brand.isConfigured ? brand.name : "our team"
        } can help you find what you’re looking for.`}
      </p>
      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Back to homepage
        </Link>
        <Link
          href="/checkout"
          className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 px-8 font-medium text-zinc-900 transition-colors hover:border-zinc-400"
        >
          View pricing
        </Link>
      </div>
    </main>
  );
}
