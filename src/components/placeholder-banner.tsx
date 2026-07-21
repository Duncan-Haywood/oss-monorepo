import Link from "next/link";

type PlaceholderBannerProps = {
  title: string;
  description: string;
  docsHref?: string;
};

export function PlaceholderBanner({
  title,
  description,
  docsHref = "/docs",
}: PlaceholderBannerProps) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-amber-800">{description}</p>
      <p className="mt-2">
        See{" "}
        <Link href={docsHref} className="underline underline-offset-2">
          project documentation
        </Link>{" "}
        for implementation plans.
      </p>
    </div>
  );
}
