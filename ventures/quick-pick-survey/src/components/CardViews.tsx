"use client";

import { CategoryIcon } from "@/components/CategoryIcon";

export type SurveyKind = "ITEMS" | "FINANCIAL" | "CONJOINED";

export type ItemsTrial = {
  trialId: string;
  itemA: { id: string; label: string; category?: string | null; slug?: string | null };
  itemB: { id: string; label: string; category?: string | null; slug?: string | null };
  answeredCount: number;
  confidence: number;
};

export type SlotLine = { icon: "money" | "bank" | "clock" | "rocket"; text: string };

export type ProfileSide = {
  identityLabel: string | null;
  identityCategory?: string | null;
  lines: SlotLine[];
};

export type FinancialTrialResp = {
  trialId: string;
  kind: SurveyKind;
  profileA: ProfileSide;
  profileB: ProfileSide;
  answeredCount: number;
  confidence: number;
};

export type Trial = ItemsTrial | FinancialTrialResp;
export type InteractionMethod = "card_tap" | "button";

export function isFinancial(t: Trial): t is FinancialTrialResp {
  return "profileA" in t;
}

const SLOT_EMOJI: Record<SlotLine["icon"], string> = {
  money: "💰",
  bank: "🏦",
  clock: "⏱️",
  rocket: "🚀",
};

export function getInstructions(kind: SurveyKind, perspective?: string, partnerName?: string): string {
  const partner = partnerName?.trim() || "your partner";
  if (perspective === "SELF") {
    switch (kind) {
      case "ITEMS":
        return "For yourself: Which do you want more in your own future?";
      case "FINANCIAL":
        return "For yourself: Which future would you rather build for your own life?";
      case "CONJOINED":
        return "For yourself: Which way of life would you rather grow into?";
    }
  }
  if (perspective === "PARTNER_GUESS") {
    switch (kind) {
      case "ITEMS":
        return `What ${partner} wants: Which do you think ${partner} would choose?`;
      case "FINANCIAL":
        return `What ${partner} wants: Which situation do you think ${partner} prefers?`;
      case "CONJOINED":
        return `What ${partner} wants: Which overall person do you think ${partner} would choose?`;
    }
  }
  switch (kind) {
    case "ITEMS":
      return partnerName
        ? `For your relationship with ${partner}: Which would matter more?`
        : "In a partner: Which matters more in the partner you would choose?";
    case "FINANCIAL":
      return partnerName
        ? `For life with ${partner}: Which situation would you prefer?`
        : "In a partner: Which situation would you prefer in a romantic partner?";
    case "CONJOINED":
      return partnerName
        ? `Thinking about ${partner}: Which overall scenario would you prefer?`
        : "In a partner: Which overall scenario would you prefer in a partner?";
  }
}

export const INSTRUCTIONS: Record<SurveyKind, string> = {
  ITEMS: "Which describes you better or matters more to you?",
  FINANCIAL: "Which situation do you prefer?",
  CONJOINED: "Which overall scenario fits you better?",
};

export function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center text-neutral-500 dark:text-neutral-400">{children}</div>
  );
}

const cardBase =
  "group relative flex flex-1 items-center justify-center overflow-hidden rounded-[2rem] border border-amber-200/80 bg-[#fff8e8] bg-[url('/card-art/intuition-background.webp')] bg-cover bg-center px-6 py-4 text-center shadow-[0_18px_45px_-24px_rgba(120,53,15,.55)] disabled:opacity-50 dark:border-amber-900/60 dark:bg-neutral-950 dark:bg-blend-soft-light";

/**
 * The action row under the deck. Buttons are explicitly labelled ("Top" /
 * "Bottom") rather than bare arrows, which read ambiguously — an arrow
 * could mean "move the card" or "rank it higher".
 */
function ActionBar({
  onUp,
  onDown,
  onSkip,
  onUndo,
  canUndo,
  disabled,
}: {
  onUp: () => void;
  onDown: () => void;
  onSkip: () => void;
  onUndo?: () => void;
  canUndo: boolean;
  disabled: boolean;
}) {
  const pickClass =
    "flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-400 bg-white py-3 text-sm font-bold text-amber-700 shadow-sm transition active:scale-95 active:bg-amber-50 disabled:opacity-40 dark:bg-neutral-900 dark:text-amber-400 dark:active:bg-amber-950/40";
  return (
    <div className="flex shrink-0 flex-col gap-1.5 py-2">
      <div className="flex items-center gap-3">
        <button onClick={onUp} disabled={disabled} className={pickClass}>
          <span aria-hidden="true">↑</span> Choose top
        </button>
        {onUndo && (
          <button
            onClick={onUndo}
            disabled={disabled || !canUndo}
            aria-label="Undo last answer"
            title="Undo last answer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-neutral-300 bg-white text-lg text-neutral-500 transition active:scale-90 disabled:opacity-30 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
          >
            ↺
          </button>
        )}
        <button onClick={onDown} disabled={disabled} className={pickClass}>
          <span aria-hidden="true">↓</span> Choose bottom
        </button>
      </div>
      {/* Skipping asks for another pair and deliberately does not update
          either option's rating. It is not an "about equal" answer. */}
      <button
        onClick={onSkip}
        disabled={disabled}
        className="w-full rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 py-2.5 text-sm font-semibold text-neutral-600 transition active:scale-[0.98] disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
      >
        Neither / show another pair
      </button>
    </div>
  );
}

export function ItemsTrialView({
  trial,
  submitting,
  onAnswer,
  onSkip,
  onUndo,
  canUndo,
}: {
  trial: ItemsTrial;
  submitting: boolean;
  onAnswer: (r: "A" | "B", method: InteractionMethod) => void;
  onSkip: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  return (
    <>
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        <button
          onClick={() => onAnswer("A", "card_tap")}
          disabled={submitting}
          className={`${cardBase} flex-col gap-4 text-2xl font-bold leading-snug text-neutral-900 dark:text-neutral-50`}
        >
          <span className="absolute left-4 top-3 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 backdrop-blur dark:bg-black/30 dark:text-neutral-300">
            Top choice
          </span>
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(251,191,36,.22),transparent_35%),radial-gradient(circle_at_85%_80%,rgba(249,115,22,.13),transparent_36%)]" />
          <span className="relative flex flex-col items-center gap-4">
            <span className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10">
              <CategoryIcon category={trial.itemA.category} slug={trial.itemA.slug} label={trial.itemA.label} size="lg" />
            </span>
            <span>{trial.itemA.label}</span>
          </span>
        </button>
        <button
          onClick={() => onAnswer("B", "card_tap")}
          disabled={submitting}
          className={`${cardBase} flex-col gap-4 text-2xl font-bold leading-snug text-neutral-900 dark:text-neutral-50`}
        >
          <span className="absolute bottom-3 left-4 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 backdrop-blur dark:bg-black/30 dark:text-neutral-300">
            Bottom choice
          </span>
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_80%_15%,rgba(251,191,36,.22),transparent_35%),radial-gradient(circle_at_15%_80%,rgba(249,115,22,.13),transparent_36%)]" />
          <span className="relative flex flex-col items-center gap-4">
            <span className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10">
              <CategoryIcon category={trial.itemB.category} slug={trial.itemB.slug} label={trial.itemB.label} size="lg" />
            </span>
            <span>{trial.itemB.label}</span>
          </span>
        </button>
      </div>
      <ActionBar
        onUp={() => onAnswer("A", "button")}
        onDown={() => onAnswer("B", "button")}
        onSkip={onSkip}
        onUndo={onUndo}
        canUndo={!!canUndo}
        disabled={submitting}
      />
    </>
  );
}

function ProfileContent({ profile }: { profile: ProfileSide }) {
  return (
    <div className="flex w-full flex-col gap-2 text-left">
      {profile.identityLabel && (
        <div className="flex items-center gap-2 text-lg font-bold text-neutral-900 dark:text-neutral-50">
          <CategoryIcon category={profile.identityCategory} />
          {profile.identityLabel}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {profile.lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2.5 text-xl font-bold text-neutral-900 dark:text-neutral-50">
            <span className="text-lg">{SLOT_EMOJI[line.icon]}</span>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinancialTrialView({
  trial,
  submitting,
  onAnswer,
  onSkip,
  onUndo,
  canUndo,
}: {
  trial: FinancialTrialResp;
  submitting: boolean;
  onAnswer: (r: "A" | "B", method: InteractionMethod) => void;
  onSkip: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  return (
    <>
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        <button
          onClick={() => onAnswer("A", "card_tap")}
          disabled={submitting}
          className={`${cardBase} flex-col items-stretch justify-center gap-2`}
        >
          <ProfileContent profile={trial.profileA} />
        </button>
        <button
          onClick={() => onAnswer("B", "card_tap")}
          disabled={submitting}
          className={`${cardBase} flex-col items-stretch justify-center gap-2`}
        >
          <ProfileContent profile={trial.profileB} />
        </button>
      </div>
      <ActionBar
        onUp={() => onAnswer("A", "button")}
        onDown={() => onAnswer("B", "button")}
        onSkip={onSkip}
        onUndo={onUndo}
        canUndo={!!canUndo}
        disabled={submitting}
      />
    </>
  );
}
