"use client";

import { useRef, useState } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";

export type SurveyKind = "ITEMS" | "FINANCIAL" | "CONJOINED";

export type ItemsTrial = {
  trialId: string;
  itemA: { id: string; label: string; category?: string | null };
  itemB: { id: string; label: string; category?: string | null };
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

export function isFinancial(t: Trial): t is FinancialTrialResp {
  return "profileA" in t;
}

const SLOT_EMOJI: Record<SlotLine["icon"], string> = {
  money: "💰",
  bank: "🏦",
  clock: "⏱️",
  rocket: "🚀",
};

export const INSTRUCTIONS: Record<SurveyKind, string> = {
  ITEMS: "Swipe the one you prefer away — up or down",
  FINANCIAL: "Swipe the situation you'd prefer away — up or down",
  CONJOINED: "Swipe the one you'd prefer away — up or down",
};

export function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center text-neutral-500 dark:text-neutral-400">{children}</div>
  );
}

const THRESHOLD = 90;
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/**
 * Swipe gesture captured anywhere in the stage. Drag up commits the top
 * card, drag down commits the bottom card. Tinder-style feedback: the
 * targeted card follows the finger 1:1, grows and shows a stamp once past
 * the commit threshold, and flies off-screen with a spring on release; the
 * other card recedes and dims. Tapping a card also picks it.
 */
function useSwipeStage(onUp: () => void, onDown: () => void, disabled: boolean) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<"up" | "down" | null>(null);
  const startY = useRef<number | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || flying) return;
    startY.current = e.clientY;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startY.current === null || disabled) return;
    setDragY(e.clientY - startY.current);
  }

  function commit(direction: "up" | "down") {
    if (disabled || flying) return;
    setFlying(direction);
    setDragging(false);
    setTimeout(() => {
      if (direction === "up") onUp();
      else onDown();
      setFlying(null);
      setDragY(0);
    }, 220);
  }

  function endDrag() {
    if (startY.current === null) return;
    startY.current = null;
    setDragging(false);
    if (dragY < -THRESHOLD) commit("up");
    else if (dragY > THRESHOLD) commit("down");
    else setDragY(0);
  }

  const progressUp = dragY < 0 ? Math.min(1, -dragY / THRESHOLD) : 0;
  const progressDown = dragY > 0 ? Math.min(1, dragY / THRESHOLD) : 0;

  const topOffset = flying === "up" ? -900 : dragY < 0 ? dragY : dragY * 0.12;
  const bottomOffset = flying === "down" ? 900 : dragY > 0 ? dragY : dragY * 0.12;
  const transition = dragging ? "none" : `transform 0.32s ${SPRING}, opacity 0.25s ease`;

  const topScale = flying === "up" ? 1.04 : 1 + progressUp * 0.03 - progressDown * 0.05;
  const bottomScale = flying === "down" ? 1.04 : 1 + progressDown * 0.03 - progressUp * 0.05;

  const topStyle: React.CSSProperties = {
    transform: `translateY(${topOffset}px) scale(${topScale}) rotate(${Math.max(-8, Math.min(0, topOffset / 18))}deg)`,
    opacity: flying === "down" ? 0.4 : 1 - progressDown * 0.35,
    transition,
  };
  const bottomStyle: React.CSSProperties = {
    transform: `translateY(${bottomOffset}px) scale(${bottomScale}) rotate(${Math.max(0, Math.min(8, bottomOffset / 18))}deg)`,
    opacity: flying === "up" ? 0.4 : 1 - progressUp * 0.35,
    transition,
  };

  return {
    stageHandlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
    topStyle,
    bottomStyle,
    commit,
    progressUp,
    progressDown,
  };
}

/** The Tinder-style "LIKE"/"NOPE" stamp — here it reads as the pick confirmation. */
function PickStamp({ progress, position }: { progress: number; position: "top" | "bottom" }) {
  if (progress < 0.12) return null;
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute ${position === "top" ? "bottom-3" : "top-3"} right-3 rotate-[-12deg] rounded-lg border-[3px] border-amber-500 px-3 py-1 text-base font-extrabold uppercase tracking-wide text-amber-500`}
      style={{ opacity: Math.min(1, progress * 1.4), transform: `rotate(-12deg) scale(${0.8 + progress * 0.25})` }}
    >
      This one
    </span>
  );
}

const cardBase =
  "relative flex flex-1 items-center justify-center overflow-hidden rounded-3xl border border-neutral-200 bg-white px-6 py-4 text-center shadow-lg disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 select-none";

/** Tinder-style circular action button. */
function ActionButton({
  onClick,
  disabled,
  label,
  glyph,
  tone,
  size = "md",
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  glyph: React.ReactNode;
  tone: "amber" | "neutral";
  size?: "md" | "lg";
}) {
  const dims = size === "lg" ? "h-16 w-16 text-2xl" : "h-12 w-12 text-lg";
  const toneClass =
    tone === "amber"
      ? "border-amber-400 text-amber-500 active:bg-amber-50 dark:active:bg-amber-950/40"
      : "border-neutral-300 text-neutral-500 active:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:active:bg-neutral-800";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full border-2 bg-white shadow-md transition active:scale-90 disabled:opacity-40 dark:bg-neutral-900 ${toneClass}`}
    >
      {glyph}
    </button>
  );
}

/**
 * The action row under the deck: pick-top, undo, pick-bottom. There is
 * deliberately no "equal" option — forcing a choice keeps the pace up and
 * the decision cheap. (The API still accepts a tie, so it can be brought
 * back without a schema change.)
 */
function ActionBar({
  onUp,
  onDown,
  onUndo,
  canUndo,
  disabled,
}: {
  onUp: () => void;
  onDown: () => void;
  onUndo?: () => void;
  canUndo: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-6 py-3">
      <ActionButton onClick={onUp} disabled={disabled} label="Pick the top one" glyph="▲" tone="amber" size="lg" />
      {onUndo && (
        <ActionButton onClick={onUndo} disabled={disabled || !canUndo} label="Undo last answer" glyph="↺" tone="neutral" />
      )}
      <ActionButton onClick={onDown} disabled={disabled} label="Pick the bottom one" glyph="▼" tone="amber" size="lg" />
    </div>
  );
}

export function ItemsTrialView({
  trial,
  submitting,
  onAnswer,
  onUndo,
  canUndo,
}: {
  trial: ItemsTrial;
  submitting: boolean;
  onAnswer: (r: "A" | "B" | "EQUAL") => void;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const { stageHandlers, topStyle, bottomStyle, commit, progressUp, progressDown } = useSwipeStage(
    () => onAnswer("A"),
    () => onAnswer("B"),
    submitting
  );
  return (
    <>
      <div className="flex flex-1 touch-pan-x flex-col gap-3 overflow-hidden" {...stageHandlers}>
        <button
          style={topStyle}
          onClick={() => commit("up")}
          disabled={submitting}
          className={`${cardBase} flex-col gap-3 text-2xl font-bold leading-snug text-neutral-900 dark:text-neutral-50`}
        >
          <PickStamp progress={progressUp} position="top" />
          <CategoryIcon category={trial.itemA.category} />
          {trial.itemA.label}
        </button>
        <button
          style={bottomStyle}
          onClick={() => commit("down")}
          disabled={submitting}
          className={`${cardBase} flex-col gap-3 text-2xl font-bold leading-snug text-neutral-900 dark:text-neutral-50`}
        >
          <PickStamp progress={progressDown} position="bottom" />
          <CategoryIcon category={trial.itemB.category} />
          {trial.itemB.label}
        </button>
      </div>
      <ActionBar
        onUp={() => commit("up")}
        onDown={() => commit("down")}
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
  onUndo,
  canUndo,
}: {
  trial: FinancialTrialResp;
  submitting: boolean;
  onAnswer: (r: "A" | "B" | "EQUAL") => void;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const { stageHandlers, topStyle, bottomStyle, commit, progressUp, progressDown } = useSwipeStage(
    () => onAnswer("A"),
    () => onAnswer("B"),
    submitting
  );
  return (
    <>
      <div className="flex flex-1 touch-pan-x flex-col gap-3 overflow-hidden" {...stageHandlers}>
        <button
          style={topStyle}
          onClick={() => commit("up")}
          disabled={submitting}
          className={`${cardBase} flex-col items-stretch justify-center gap-2`}
        >
          <PickStamp progress={progressUp} position="top" />
          <ProfileContent profile={trial.profileA} />
        </button>
        <button
          style={bottomStyle}
          onClick={() => commit("down")}
          disabled={submitting}
          className={`${cardBase} flex-col items-stretch justify-center gap-2`}
        >
          <PickStamp progress={progressDown} position="bottom" />
          <ProfileContent profile={trial.profileB} />
        </button>
      </div>
      <ActionBar
        onUp={() => commit("up")}
        onDown={() => commit("down")}
        onUndo={onUndo}
        canUndo={!!canUndo}
        disabled={submitting}
      />
    </>
  );
}
