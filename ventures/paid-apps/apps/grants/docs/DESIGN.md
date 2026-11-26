# Design system: "Juniper & Sandstone"

Grant Autopilot serves small tribal and community nonprofits and workforce/trades programs, many of
them in New Mexico. The UI should feel **warm, calm, trustworthy and professional**. It should never
read as "startup neon", and it uses **no cultural motifs or stereotypes**: the warmth comes from the
color temperature (warm stone grays, a sandstone accent), not from decoration.

All tokens live in `src/client/styles.css` (`@theme`, Tailwind 4). Primitives in
`src/client/components/ui/**` use only these tokens. Pages should too.

## Why this palette

Two options were built and checked for contrast (both passed every pair below):

| | A: Juniper & Sandstone (chosen) | B: Dusk Indigo & Clay |
|---|---|---|
| Primary | deep juniper teal-green `#226955` | indigo-slate `#454F8E` |
| Accent | sandstone/terracotta `#A3582B` | clay `#A4502F` |
| Neutrals | warm stone | warm greige |

**A was chosen** for three reasons:

1. It keeps the brand recognisable. The logo and existing users already know a teal, and juniper is
   a deeper, warmer, more grounded version of it.
2. Green-teal suggests growth and stewardship, which suits grants. Indigo is the default "SaaS" hue.
3. B needed its `info` color moved to teal to stay distinct from the indigo brand, which made the
   overall system busier.

The trade-off with A is that brand and success are both greens (`brand-600` and `success-600` differ
by only 1.13:1). We handle this in two ways: success never appears without a check icon or a text
label, and brand is used only for actions and navigation, never for status.

## Palette (hex)

| step | brand | accent | neutral | success | warning | danger | info |
|---|---|---|---|---|---|---|---|
| 0 | | | `#FFFFFF` | | | | |
| 50 | `#F0F7F4` | `#FCF6F0` | `#FAF9F7` | `#EFF8F1` | `#FDF7E7` | `#FDF2F2` | `#F0F5FA` |
| 100 | `#DAEDE4` | `#F8E8D8` | `#F4F2EE` | `#D7EFDD` | `#FAEBC3` | `#FAE0DF` | `#DCE7F3` |
| 200 | `#B5DACA` | `#F0CFB0` | `#E8E4DE` | `#ADDCB9` | `#F3D584` | `#F3BEBC` | `#B8CFE7` |
| 300 | `#86C0AA` | `#E4AE80` | `#D6D0C7` | `#7CC48F` | `#E9BB4A` | `#E8928F` | `#8AAED6` |
| 400 | `#529F86` | `#D58D57` | `#8F877D` | `#4FA868` | `#D69E22` | `#DA6460` | `#5D8CC0` |
| 500 | `#2F8068` | `#C2703A` | `#6B645B` | `#358C50` | `#B07F12` | `#C6433F` | `#4172AA` |
| 600 | `#226955` | `#A3582B` | `#57514A` | `#2A7341` | `#8E640E` | `#AA332F` | `#325C8F` |
| 700 | `#1C5646` | `#854624` | `#443F39` | `#215C35` | `#724F0F` | `#8C2A27` | `#294B75` |
| 800 | `#17463A` | `#6B3920` | `#2E2A26` | `#1C4A2C` | `#5B3F11` | `#722522` | `#223E60` |
| 900 | `#123930` | `#57301C` | `#1F1C19` | `#173D25` | `#4A3411` | `#5E211F` | `#1D3450` |
| 950 | `#0A231D` | `#311809` | `#13110F` | `#0C2415` | `#2B1D08` | `#360F0E` | `#111F31` |

`neutral` overrides Tailwind's built-in `neutral`. Tailwind's `slate`, `gray`, `emerald`, `amber`,
`red`, `sky` and the other default hues still exist, but **do not use them** (see the rules below).

## Contrast (WCAG 2.x, measured)

Text needs 4.5:1. UI components and large text need 3:1. These were computed with a small script
(relative luminance, sRGB) when the palette was chosen; re-run one if you change a value.

| Pair | Ratio | Need |
|---|---|---|
| text-strong `neutral-900` on surface / canvas / muted | 16.96 / 16.12 / 15.17 | 4.5 |
| text-default `neutral-700` on surface / canvas / muted | 10.42 / 9.90 / 9.32 | 4.5 |
| text-muted `neutral-600` on surface / canvas / muted | 7.83 / 7.44 / 7.01 | 4.5 |
| text-subtle `neutral-500` on surface / canvas / muted | 5.83 / 5.55 / 5.22 | 4.5 |
| text-link `brand-700` on surface / canvas / muted | 8.51 / 8.08 / 7.61 | 4.5 |
| white on primary button `brand-600` / hover `brand-700` | 6.52 / 8.51 | 4.5 |
| white on danger button `danger-600` | 6.51 | 4.5 |
| white on `accent-600` | 5.27 | 4.5 |
| active nav `brand-800` on `brand-50` | 9.79 | 4.5 |
| badge text `{tone}-800` on `{tone}-50`: brand / success / warning / danger / info / accent | 9.79 / 9.38 / 9.07 / 9.56 / 9.94 / 8.78 | 4.5 |
| neutral badge `neutral-700` on `neutral-100` | 9.32 | 4.5 |
| semantic text `{tone}-700` on white: success / warning / danger / info | 7.93 / 7.39 / 8.48 / 8.91 | 4.5 |
| status icons `{tone}-600` on white: success / warning / danger / info | 5.79 / 5.28 / 6.51 / 6.86 | 3 |
| dots and bars `{tone}-500` on white: success / warning / danger | 4.18 / 3.57 / 4.91 | 3 |
| input border / icon / placeholder `neutral-400` on white | 3.54 | 3 (see note) |
| focus ring `brand-600` on white | 6.52 | 3 |

## Tokens

### Scales
`brand-*`, `accent-*`, `neutral-*`, `success-*`, `warning-*`, `danger-*`, `info-*`, with steps 50 to
950 (neutral also has 0).

### Semantic aliases (use these first)

| Purpose | Class | Value |
|---|---|---|
| App background | `bg-canvas` | neutral-50 |
| Cards, tables, inputs | `bg-surface` | white |
| Menus, popovers, dialogs, toasts | `bg-elevated` (+ `shadow-overlay`) | white |
| Table heads, wells, hover fills | `bg-muted` | neutral-100 |
| Card footers, zebra rows, quiet panels | `bg-subtle` | neutral-50 |
| Inverse (tooltips) | `bg-inverse` / `text-inverse` | neutral-900 / neutral-50 |
| Headings, primary text | `text-strong` | neutral-900 |
| Body text | `text-default` | neutral-700 |
| Secondary text, descriptions | `text-muted` | neutral-600 |
| Meta, captions, timestamps | `text-subtle` | neutral-500 |
| Links | `text-link` | brand-700 |
| Hairlines inside cards | `border-line-subtle` | neutral-100 |
| Card and section borders, dividers | `border-line` / `divide-line` | neutral-200 |
| Secondary-button borders, dashed empty states | `border-line-strong` | neutral-300 |
| Form-control borders (3:1) | `border-line-input` | neutral-400 |
| Focus outline | `outline-focus` | brand-600 |

### Type
Body copy is **16px** (`text-base`, line-height 1.625). `text-sm` (14px / 22px) is for dense UI:
tables, badges, help text. Headings tighten as they grow (`text-2xl` uses -0.018em tracking, and
`text-3xl`/`text-4xl` go down to -0.025em). The page `<h1>` (PageHeader) is 24px on phones and 28px
from `sm` up. Inputs use 16px on phones (so iOS doesn't zoom) and 14px from `sm` up.

### Shape, depth, motion
- Radius: `sm` 5px, `md` 8px (buttons, inputs), `lg` 10px (alerts, menus), `xl` 14px (cards),
  `2xl` 18px.
- Shadows are warm-tinted: `shadow-xs` (buttons, inputs), `shadow-card`, `shadow-raised` (a card on
  hover), `shadow-overlay` (floating layers).
- Motion: 150–220ms ease-out (`--ease-out-soft`). Only opacity and translate, never a bounce.
  `prefers-reduced-motion` turns off all animation and transition globally (styles.css).

## Components

- **Buttons:** `primary` is solid brand and gets one per view: the main next step. `secondary` is
  outlined on a surface, for everything else. `ghost` is for toolbars and dense rows. `danger` is
  only for destructive confirmations. `outline` is a brand-tinted secondary, and `link` is inline.
- **Cards:** `border-line`, `bg-surface` and `shadow-card`. The header is separated by
  `border-line-subtle` and the footer sits on `bg-subtle`. Don't nest cards inside cards; use a
  `bg-subtle` well instead.
- **Tables:** compact rows (`py-2.5`), zebra striping (`bg-subtle`), a brand-tinted hover, and
  uppercase `text-muted` headers on `bg-muted`. Numbers use tabular figures.
- **Forms:** the `Field` component wires up the label, hint and error. Inputs have 3:1 borders, a
  darker border on hover, and a brand border plus a soft brand ring on focus. Invalid inputs
  (`aria-invalid`) show a danger border and ring. A required field gets an asterisk and real
  `required`.
- **Placeholders** use `neutral-400` (3.54:1), so an example value never looks like a filled-in
  one. Because of that, a placeholder must only ever be an example: the label and hint, which are
  always visible, carry everything essential.
- **Badges:** use `<Badge tone>` or `<StatusBadge status>`, always with a text label. Tones are
  neutral, brand, success, warning, danger, info and accent, all as `{tone}-50` background,
  `{tone}-800` text and a `{tone}-200` ring.
- **Empty states:** an icon in a soft brand circle, a one-line title, one sentence of explanation and
  **one next action** (a button). No illustrations.
- **Loading:** use `Skeleton`, `SkeletonText` or `SkeletonCard` shaped like the content. A spinner
  is only for inline busy states.
- **Focus:** every interactive element shows a 2px `outline-focus` ring, offset by 2px, on
  `:focus-visible`. A global rule covers elements that forget it.
- **App shell:** the sidebar groups navigation into Pipeline, Knowledge and Organization. The active
  item gets a brand tint, a 3px brand bar and semibold text. The org switcher sits at the top as a
  card-like button with a sandstone initial. The desktop top bar shows breadcrumbs (org › section ›
  page › detail), and content is capped at `max-w-7xl`.

## Citation and grounding states (colorblind-safe)

Never signal these states with color alone:

| State | Citation chip | Claim text | Extra cue |
|---|---|---|---|
| Supported / confirmed fact | brand tint, **solid** ring | plain | "Confirmed" badge in the popover |
| Unconfirmed fact | warning tint, **dashed** outline | — | "Needs review" badge and a "Nobody has confirmed…" note |
| Unavailable / unsupported | danger tint, **struck-through** number | **wavy** underline and a warning-icon button | an aria-label starting "Not supported:" |
| Partly supported | — | **dotted** underline and a warning-icon button | an aria-label starting "Partly supported:" |

## Do / Don't

**Do**
- Use semantic aliases (`text-muted`, `bg-surface`, `border-line`) before raw scale steps.
- Keep exactly one `primary` button per view or card.
- Pair every status color with an icon, a pattern or a text label.
- Use the accent sparingly: eyebrows, the org initial, at most one highlight per screen.
- Use `{tone}-700` or `-800` for text on tinted backgrounds, and `-500` or `-600` for icons, dots and
  bars.
- Give empty states a next action.

**Don't**
- Don't use Tailwind's default hues (`slate-*`, `gray-*`, `teal-*`, `emerald-*`, `amber-*`, `red-*`,
  `sky-*`, …). Map them to `neutral`, `brand`, `success`, `warning`, `danger` or `info` instead.
- Don't use `neutral-400` or lighter for text. It is for icons and borders only.
- Don't use accent for actions or status. It is not a warning color.
- Don't use brand green to mean "success" or "approved".
- Don't add gradients, glows, saturated neon or cultural or regional motifs.
- Don't animate layout or use durations over 250ms.

## Dark mode

Not shipped yet. The semantic aliases (`bg-canvas/surface/elevated/muted`, `text-strong/default/
muted/subtle`, `border-line*`) are what you would remap under
`@media (prefers-color-scheme: dark)`. Pages still use some raw scale steps and `bg-white`, so move
those to aliases first.
