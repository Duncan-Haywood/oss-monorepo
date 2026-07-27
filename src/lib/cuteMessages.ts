/** Small, occasional encouragement notes — English with a short Persian line under it. */
export const CUTE_BREAKS: { en: string; fa: string }[] = [
  { en: "You're doing great 💛", fa: "آفرین عزیزم" },
  { en: "No rush, take your time", fa: "عجله‌ای نیست" },
  { en: "Thank you for this 💛", fa: "خیلی ممنونم" },
  { en: "You're amazing", fa: "تو فوق‌العاده‌ای" },
  { en: "Loving this, keep going", fa: "دوستت دارم" },
  { en: "Almost a milestone", fa: "نزدیکه" },
];

export function cuteBreakForCount(count: number): { en: string; fa: string } | null {
  const EVERY = 8;
  if (count > 0 && count % EVERY === 0) {
    return CUTE_BREAKS[(count / EVERY - 1) % CUTE_BREAKS.length];
  }
  return null;
}
