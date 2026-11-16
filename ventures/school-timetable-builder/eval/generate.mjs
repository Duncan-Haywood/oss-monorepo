// Deterministic synthetic secondary schools for the solver benchmark.
// Every class is fully booked (lessons = days x periods), which is the hard
// case: no slack slot can absorb a clash. Teachers are given subject loads of
// at most `maxLoad` periods, the way a head of timetabling splits a department.
export function syntheticSchool({ classes = 12, days = 5, periods = 6, maxLoad = 24, seed = 7, offRate = 0.05 } = {}) {
  let a = seed >>> 0;
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // subject: periods per week, doubles, room type
  const curriculum = [
    ["Maths", 5, 0, ""], ["English", 5, 0, ""], ["Science", 4, 2, "lab"], ["History", 2, 0, ""],
    ["Geography", 2, 0, ""], ["Languages", 3, 0, ""], ["Art", 2, 1, "art"], ["Computing", 2, 0, "ict"],
    ["Music", 1, 0, ""], ["PE", 2, 1, "gym"], ["RE", 1, 0, ""], ["Drama", 1, 0, ""],
  ];
  const slots = days * periods;
  const total = curriculum.reduce((s, c) => s + c[1], 0);
  if (total !== 30) throw new Error("curriculum must fill 30 periods");
  const lines = [`days: ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].slice(0, days).join(", ")}`, `periods: ${periods}`, "breaks after: 2, 4"];
  const roomsNeeded = { lab: 0, art: 0, ict: 0, gym: 0 };
  for (const [, n, , type] of curriculum) if (type) roomsNeeded[type] += n * classes;
  const rooms = [];
  for (const [type, need] of Object.entries(roomsNeeded)) {
    const count = Math.ceil(need / (slots * 0.8));
    for (let i = 1; i <= count; i++) rooms.push(`${type.toUpperCase()} ${i} (${type})`);
  }
  lines.push(`rooms: ${rooms.join(", ")}`);
  const names = Array.from({ length: classes }, (_, i) => `${7 + Math.floor(i / 4)}${"ABCD"[i % 4]}`);
  const teacherLoad = new Map();
  const lessonLines = [];
  for (const [subject, n, doubles, type] of curriculum) {
    let t = 0;
    let load = 0;
    for (const c of names) {
      if (load + n > maxLoad) { t++; load = 0; }
      const teacher = `${subject}${t + 1}`;
      load += n;
      teacherLoad.set(teacher, load);
      const opts = [doubles ? `${doubles} doubles` : "", type].filter(Boolean);
      lessonLines.push(`${c}: ${subject} / ${teacher} / ${n}${opts.length ? " / " + opts.join(" / ") : ""}`);
    }
  }
  for (const [teacher, load] of teacherLoad) {
    // a part-timer day off for a few teachers, never pushing them past capacity
    if (rand() < offRate * 4 && load <= slots - 2 * periods) {
      const d = ["Mon", "Tue", "Wed", "Thu", "Fri"][Math.floor(rand() * days)];
      lines.push(`teacher ${teacher}: off ${d}`);
    }
  }
  return [...lines, ...lessonLines].join("\n") + "\n";
}
