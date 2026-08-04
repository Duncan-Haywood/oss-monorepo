import Link from "next/link";
import type { ReactNode } from "react";

export const proseClass =
  "prose prose-zinc max-w-none text-zinc-600 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-zinc-900 prose-a:text-zinc-900 prose-code:text-sm";

type DocPageProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  related?: { href: string; label: string }[];
};

export function DocPage({ title, subtitle, children, related }: DocPageProps) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm text-zinc-500">
        <Link href="/docs" className="underline underline-offset-2">
          Documentation
        </Link>
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-zinc-500">{subtitle}</p> : null}
      <div className={`${proseClass} mt-8`}>{children}</div>
      {related && related.length > 0 ? (
        <div className="mt-12 border-t border-zinc-200 pt-8">
          <h2 className="text-sm font-semibold text-zinc-900">Related</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {related.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="underline underline-offset-2">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-12 text-sm text-zinc-500">
        <Link href="/" className="underline underline-offset-2">
          Back to home
        </Link>
      </p>
    </main>
  );
}

export function DocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="underline underline-offset-2">
      {children}
    </Link>
  );
}
