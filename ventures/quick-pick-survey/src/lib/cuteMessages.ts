/** General encouragement notes for general audience survey experience. */
export const CUTE_BREAKS: { en: string }[] = [
  { en: "You're doing great 💛" },
  { en: "No rush, take your time" },
  { en: "Thank you for participating 💛" },
  { en: "You're doing amazing" },
  { en: "Keep going, great progress!" },
  { en: "Almost a milestone" },
];

export function cuteBreakForCount(count: number): { en: string } | null {
  const EVERY = 8;
  if (count > 0 && count % EVERY === 0) {
    return CUTE_BREAKS[(count / EVERY - 1) % CUTE_BREAKS.length];
  }
  return null;
}
