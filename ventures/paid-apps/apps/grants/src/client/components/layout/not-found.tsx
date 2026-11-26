// Reusable "not found" view (unknown route, unknown org, missing resource).
import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { buttonClass } from "../ui";

export function NotFound({
  title = "Page not found",
  description = "The page you're looking for doesn't exist or you don't have access to it.",
  backTo = "/",
  backLabel = "Go to home page",
}: {
  title?: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Compass className="h-6 w-6" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-strong">{title}</h1>
      <p className="mt-2 text-sm text-subtle">{description}</p>
      <Link to={backTo} className={buttonClass({ className: "mt-6" })}>
        {backLabel}
      </Link>
    </div>
  );
}
