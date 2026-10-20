// Testimonial collection rules. Pure functions over a plain-object state; no I/O.
// The same file is used by the server and by the landing-page demo.

export const LIMITS = { name: 80, role: 80, company: 80, text: 600, minText: 20, perIpPerDay: 5, maxItems: 5000, maxForms: 200 };
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

export const newState = () => ({ forms: {}, items: [], rate: {} });

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);

export function createForm(state, { slug, title, prompt }, now) {
  const s = String(slug || "").toLowerCase();
  if (!SLUG_RE.test(s)) return { error: "slug must be 2-32 characters: a-z, 0-9 or -" };
  if (state.forms[s]) return { error: "that slug is taken" };
  if (Object.keys(state.forms).length >= LIMITS.maxForms) return { error: "form limit reached" };
  const form = { slug: s, title: clean(title, 80) || "Share your experience", prompt: clean(prompt, 240) || "What did you use us for, and what changed?", createdAt: now };
  state.forms[s] = form;
  return { form };
}

// A submission needs an explicit consent tick: nothing is published without the
// person's permission, and nothing is published without the owner's approval.
export function submit(state, form, input, { ipKey, now, id }) {
  if (clean(input.website, 200)) return { error: "ignored", silent: true }; // honeypot: bots fill every field
  const name = clean(input.name, LIMITS.name), text = clean(input.text, LIMITS.text);
  if (!name) return { error: "Please tell us your name." };
  if (text.length < LIMITS.minText) return { error: `Please write at least ${LIMITS.minText} characters.` };
  if (!(input.consent === true || input.consent === "on" || input.consent === "true" || input.consent === "1")) return { error: "Please tick the box to allow us to publish this." };
  let rating = null;
  if (input.rating !== undefined && input.rating !== null && input.rating !== "") {
    rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Rating must be 1 to 5." };
  }
  const email = clean(input.email, 120).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email does not look right." };
  if (state.items.length >= LIMITS.maxItems) return { error: "This form is not accepting more right now." };
  const day = new Date(now).toISOString().slice(0, 10), rk = `${day}:${ipKey}`;
  for (const k of Object.keys(state.rate)) if (!k.startsWith(day)) delete state.rate[k];
  if ((state.rate[rk] || 0) >= LIMITS.perIpPerDay) return { error: "Too many submissions today. Please try again tomorrow." };
  if (state.items.some((i) => i.form === form.slug && i.text === text)) return { error: "ignored", silent: true }; // double-submit
  state.rate[rk] = (state.rate[rk] || 0) + 1;
  const item = { id, form: form.slug, name, role: clean(input.role, LIMITS.role), company: clean(input.company, LIMITS.company), text, rating, email, consent: true, status: "pending", at: now };
  state.items.push(item);
  return { item };
}

export function setStatus(state, id, status) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return { error: "no such testimonial" };
  if (!["approved", "hidden", "pending"].includes(status)) return { error: "status must be approved, hidden or pending" };
  it.status = status;
  return { item: it };
}

export function remove(state, id) {
  const i = state.items.findIndex((x) => x.id === id);
  if (i < 0) return { error: "no such testimonial" };
  state.items.splice(i, 1);
  return { ok: true };
}

// Public view: approved only, never the email, newest first. Text is never edited by the host.
export function publicWall(state, formSlug, limit = 50) {
  return state.items.filter((i) => i.status === "approved" && (!formSlug || i.form === formSlug)).slice(-limit).reverse()
    .map(({ id, name, role, company, text, rating, at }) => ({ id, name, role, company, text, rating, at }));
}

export function stats(state) {
  const by = { pending: 0, approved: 0, hidden: 0 };
  let sum = 0, n = 0;
  for (const i of state.items) { by[i.status]++; if (i.status === "approved" && i.rating) { sum += i.rating; n++; } }
  return { forms: Object.keys(state.forms).length, total: state.items.length, ...by, averageRating: n ? Math.round((sum / n) * 100) / 100 : null, rated: n };
}

export function toCsv(items) {
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [["id", "form", "status", "name", "role", "company", "rating", "text", "email", "date"], ...items.map((i) => [i.id, i.form, i.status, i.name, i.role, i.company, i.rating ?? "", i.text, i.email, new Date(i.at).toISOString().slice(0, 10)])].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
