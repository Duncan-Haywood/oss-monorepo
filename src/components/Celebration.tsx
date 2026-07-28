"use client";

const PARTICLES = ["✨", "💛", "⭐", "🎉"];

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A brief, non-blocking burst shown right after an answer is submitted —
 * a small "+1" plus a few particles. Remount via a changing `burstKey` to
 * replay it; `milestone` makes it bigger for round-number totals.
 */
export function Celebration({
  burstKey,
  milestone,
  label,
}: {
  burstKey: number;
  milestone: boolean;
  label?: string;
}) {
  const rand = mulberry32(burstKey + 1);
  const particles = Array.from({ length: milestone ? 10 : 5 }, () => {
    const angle = rand() * Math.PI * 2;
    const distance = 40 + rand() * (milestone ? 70 : 40);
    return {
      emoji: PARTICLES[Math.floor(rand() * PARTICLES.length)],
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 10,
      delay: rand() * 0.08,
    };
  });

  return (
    <div
      key={burstKey}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-visible"
    >
      <div
        className={`animate-pop-fade whitespace-nowrap font-extrabold ${milestone ? "text-3xl text-amber-500" : "text-2xl text-amber-400"}`}
      >
        {milestone ? `🎉 ${label ?? "Level up!"}` : "+1"}
      </div>
      {particles.map((p, i) => (
        <span
          key={i}
          className="animate-particle absolute text-lg"
          style={{ ["--dx" as string]: `${p.dx}px`, ["--dy" as string]: `${p.dy}px`, animationDelay: `${p.delay}s` }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
