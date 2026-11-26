// Small form helpers shared by onboarding + settings pages (tag input, switch, money input).
import { cn } from "@client/lib/cn";
import { X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";

/**
 * Free-text tags: type and press Enter to add (commas are kept, e.g. "Gallup, NM");
 * Backspace on an empty input removes the last tag.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  ariaDescribedBy,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaDescribedBy?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const parts = raw.trim() ? [raw.trim()] : [];
    if (parts.length === 0) return;
    const lower = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const p of parts) {
      if (!lower.has(p.toLowerCase())) {
        next.push(p);
        lower.add(p.toLowerCase());
      }
    }
    onChange(next);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 py-1.5 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100",
        disabled && "bg-neutral-50",
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-sm text-brand-700"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-brand-100"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(value.filter((v) => v !== tag))}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </span>
      ))}
      <input
        id={id}
        className="min-w-32 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm placeholder:text-neutral-400 focus:outline-none"
        value={draft}
        disabled={disabled}
        placeholder={value.length === 0 ? placeholder : "Add another…"}
        aria-describedby={ariaDescribedBy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
      />
    </div>
  );
}

/** Accessible on/off switch with a label and an optional explanation underneath. */
export function SwitchField({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={`${id}-label`} className="text-sm font-medium text-neutral-900">
          {label}
        </p>
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 text-sm text-neutral-500">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-brand-600" : "bg-neutral-300",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/** Whole-dollar input that reads/writes integer cents. */
export function MoneyInput({
  id,
  cents,
  onChange,
  disabled,
  step = 1000,
  ariaDescribedBy,
  placeholder,
}: {
  id: string;
  cents: number | null;
  onChange: (cents: number | null) => void;
  disabled?: boolean;
  step?: number;
  ariaDescribedBy?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-neutral-500">
        $
      </span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={ariaDescribedBy}
        className="block h-10 w-full rounded-md border border-neutral-300 bg-white py-2 pr-3 pl-7 text-sm shadow-sm placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-neutral-50"
        value={cents == null ? "" : String(Math.round(cents / 100))}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") return onChange(null);
          const dollars = Number(raw);
          if (Number.isFinite(dollars)) onChange(Math.max(0, Math.round(dollars * 100)));
        }}
      />
    </div>
  );
}

/** Parse a free-form "$25,000" / "25000" / "25k" into cents; null if empty or invalid. */
export function parseDollarsToCents(raw: string): number | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[$,\s]/g, "");
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(s);
  if (!m) return null;
  const mult = m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1;
  return Math.round(Number(m[1]) * mult * 100);
}
