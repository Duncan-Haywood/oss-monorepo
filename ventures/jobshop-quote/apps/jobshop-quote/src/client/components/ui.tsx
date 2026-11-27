// Small UI primitives (Tailwind). Kept in one file: this app has few screens.
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-sky-800 text-white hover:bg-sky-900",
        variant === "secondary" &&
          "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100",
        variant === "danger" && "bg-red-700 text-white hover:bg-red-800",
        variant === "ghost" && "text-sky-800 hover:bg-sky-50",
        className,
      )}
    />
  );
}

export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-lg border border-stone-200 bg-white p-4 shadow-sm", className)}>
      {(title || actions) && (
        // Wraps on a phone: a card with three or four actions was wider than a 390 px screen.
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-stone-900">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full min-w-0 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-sky-700 focus:outline-none focus:ring-1 focus:ring-sky-700";

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cx(inputClass, props.className)} />
);
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={cx(inputClass, props.className)} />
);
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={cx(inputClass, props.className)} />
);

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <p className="text-sm text-red-700" role="alert">
      {msg}
    </p>
  );
}

export function Badge({
  children,
  tone = "stone",
}: {
  children: ReactNode;
  tone?: "stone" | "green" | "amber" | "red" | "sky";
}) {
  const tones = {
    stone: "bg-stone-100 text-stone-700",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    sky: "bg-sky-100 text-sky-800",
  };
  return (
    <span className={cx("inline-block rounded px-1.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, "stone" | "green" | "amber" | "red" | "sky"> = {
  draft: "stone",
  sent: "sky",
  won: "green",
  lost: "red",
  expired: "amber",
  superseded: "stone",
  new: "stone",
  extracted: "amber",
  quoted: "green",
  archived: "stone",
};
