# Accessibility

What is enforced mechanically, what has only been read in the markup, and what
nobody has checked at all. The third column is the one that matters: a document
listing only what is done reads as a clean bill of health.

This app is answered on a phone, in the gaps of a day, by two people who are
not being paid to persist with it. Every row below is downstream of goal 4 in
[PRODUCT-GOALS.md](PRODUCT-GOALS.md) — *worth answering the next question*. An
11px label at 2.5:1 in daylight is not a minor infraction; it is the label
explaining why a result is not shown yet, unread by exactly the person who was
about to stop.

## Enforced by a test

| Property | Where | What it does |
| --- | --- | --- |
| Text contrast, WCAG AA | `src/lib/contrastAudit.test.ts` | Reads every class list in `src/**/*.tsx` and `developmentprocess.tsx`, resolves each colour against the palette in `node_modules/tailwindcss/theme.css`, and fails anything below 4.5:1 (3:1 for large text), in both colour schemes |
| The contrast maths itself | `src/lib/contrast.test.ts` | oklch → sRGB, relative luminance and the ratio, against values fixed by the WCAG definition and by Tailwind's own published hex |
| Screens all recover from a dropped request | `docs/SCREENS.md` + `src/lib/screenInventory.test.ts` | Not accessibility as such, but the same failure mode: a property some screens had and others did not, invisible until put in a column |
| Rendered errors are announced | `src/lib/errorAnnouncement.test.ts` | Finds every `{error && …}` element that renders the message itself, and fails any without `role="alert"` or `aria-live`. Retry buttons gated on the same variable are skipped — they are controls, not announcements |

### How the contrast check works, and what it cannot see

It reads class strings, not a rendered page — there is no browser here to
sample pixels from. That buys a check that runs in 300ms on every commit, and
it costs three things, all of which are worth knowing before trusting a green
run:

- **One string literal is treated as one element.** True of this codebase,
  including the ternaries whose branches are separate literals.
- **A background counts only if it is on the element itself.** Text whose
  background comes from an ancestor is measured against the page surface. Right
  for the ordinary case — a white card on a white page — and wrong for text on
  a coloured container, which is why exemptions are listed in the test with the
  container named.
- **Opacity in a `style` prop is invisible to it.** The swipe stamp in
  `CardViews` fades in through inline opacity; the check sees its final state.

It also cannot see anything that is not a colour: focus rings, colour used as
the only cue, reading order, or what a screen reader actually says.

## Read in the markup, not driven

| Property | State |
| --- | --- |
| `role="progressbar"` with `aria-valuenow`/`min`/`max` | On both live progress bars |
| Decorative content hidden | `aria-hidden` on emoji, category art, and the swipe stamp |
| Persian copy | `lang="fa"` and `dir="rtl"`, so a screen reader does not apply English phonetics |
| Reduced motion | `prefers-reduced-motion` collapses the card animations |
| Buttons have accessible names | `aria-label` where the visible label is an arrow or a glyph |

Each of these was checked by reading the JSX. None has been driven with an
assistive technology, which is a different claim.

## Nobody has checked

- **A real screen reader pass.** VoiceOver on the phone the app is actually
  answered on, through one full round: welcome, consent, a dozen cards, an
  undo, and the couple screen.
- **Keyboard-only operation.** The swipe loop has button fallbacks, but nobody
  has tried to complete a round without touching the cards, and focus is never
  moved explicitly after a card advances.
- **Focus visibility.** Nothing sets a focus ring; the browser default survives
  or does not depending on the element.
- **Colour as the only cue.** The couple screen uses amber and emerald to
  separate aligned from diverged rows. Whether the text alone carries it has
  not been checked.
- **Target size.** The thumb-sized controls look fine; none has been measured
  against the 24×24 CSS px floor.

## If you are adding a colour

Run `npm test`. The audit fails with the file, the line, the two colours and
the ratio, so the fix is usually one shade. The substitutions this repo has
already made, for the light scheme on white:

| Was | Is | Ratio |
| --- | --- | --- |
| `text-neutral-400` | `text-neutral-500` | 2.58 → 4.74 |
| `text-red-500` | `text-red-600` | 3.81 → 4.77 |
| `text-amber-600` | `text-amber-700` | 3.20 → 5.03 |
| `text-emerald-600` | `text-emerald-700` | 3.65 → 5.36 |
| `text-rose-500` | `text-rose-600` | 3.75 → 4.53 |

Dark mode is the mirror image: those darker shades fall below the floor on
`#0a0a0a`, so each carries a `dark:` counterpart one or two steps lighter. A
colour with no `dark:` variant renders in **both** schemes — that is what left
twelve elements at 4.18:1 in the dark, and it is the mistake most likely to be
repeated.
