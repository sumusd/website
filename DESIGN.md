# DESIGN.md

## Theme

Light only. A holder checks backing and mints/redeems in a normal browser, usually in daylight; a
calm near-white surface reads as sober financial infrastructure, not a "crypto" tool. Dark mode is
intentionally disabled (the `dark:` variant is gated to a `.dark` ancestor that is never added).

## Color (OKLCH, tinted toward the brand green, hue ~155)

- Surface / background: near-white, faint green tint — `oklch(0.994 0.003 150)`.
- Foreground / ink: near-black, faint green tint — `oklch(0.23 0.012 155)`.
- Tailwind's `black` / `white` tokens are remapped to these in one place, so every neutral utility
  (`text-black/60`, `border-black/10`, `bg-white`, …) inherits the tint. Never `#000` / `#fff`.
- Accent (single): emerald — the mark, the deposit nudge, focus rings. Kept to ≤10% of the surface.
- Semantic: amber for distress / under-collateralized redemption, red for paused minting. Each used
  only for its state, never decoration.

## Typography

- Geist (sans) for everything; Geist Mono available for code. One family.
- Fixed rem scale, tight ratio (product, not brand). Live numeric values use `tabular-nums` so they
  don't jitter on refresh.
- Prose capped well under 75ch by the `max-w-md` column.

## Layout

- Single centered column, `max-w-md`. A stats row, a mint/redeem panel, an FAQ. Cards are not nested.
- Vertical rhythm at `gap-6`; panels are `rounded-2xl` with hairline borders, inputs `rounded-lg`.

## Components

- Primary button: solid ink fill, off-white label, full width; hover dims, active presses, visible
  emerald focus ring; clear disabled state.
- Segmented mint/redeem toggle on a tinted track (`aria-pressed`, focus ring).
- Inputs: hairline border, accent border on focus, label associated by `htmlFor`. Native `select`
  for flavor choice (labelled).
- State surfaced inline (paused minting, pro-rata distress), never in modals.

## Motion

- Short (~150–200ms), ease-out, opacity/transform only (never layout properties). Respects
  `prefers-reduced-motion`.
