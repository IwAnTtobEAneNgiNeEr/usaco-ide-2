# USACO IDE 2.0 — Design System

> **One source of truth.** Every global design decision — colour, surface,
> spacing, radius, shadow, type, motion — lives in
> [`frontend/styles/tokens.css`](../frontend/styles/tokens.css). Nothing else
> should define these values. This is the foundation every future sprint
> builds on.

---

## 1. The identity: "Forge"

A warm graphite workbench lit by **one** amber-gold accent — the colour of a
desk lamp at 1am. Not the generic "AI dark" fingerprint (navy + cornflower
blue + neon purple). Verdict colours (AC / WA / TLE / …) stay functional —
this is a judge, so the status vocabulary is sacred.

| | Dark (default) | Light ("warm paper") |
|---|---|---|
| Background | `#0f0f12` | `#f4f1ea` |
| Panel / card | `#141418` | `#fbf9f4` |
| Text | `#ecebe5` | `#2a2620` |
| Accent (gold) | `#e6a93e` | `#b5791c` (deepened for contrast on paper) |

---

## 2. CSS layer order (the cascade, top to bottom = later wins)

```
fonts.css        vendored Geist + JetBrains Mono @font-face
main.css         base layout, components, EDITOR tokens (--syn-*, --code-*, --ed-*)
features.css     feature-specific component styles
theme.css        light-theme component overrides
journey.css      Journey/home screen
polish.css       feature palettes (viz, skill-map) + polish
refine.css       coach + responsive + reading-mode refinements
lux.css          motion easing + raised-surface treatment
forge.css        component RE-POINTS that spend the tokens (brand, buttons,
                 tabs, problem list, scrollbar, …) — NO token definitions
tokens.css       ← THE DESIGN SYSTEM. Loaded LAST. Authoritative for every
                 global --token (dark :root + .light-theme).
```

**Why tokens.css is loaded last:** so it is the final word on every global
token regardless of what the older layers happen to declare. Going forward you
edit one file to re-pigment the whole product.

### Runtime overrides (always win — by design)

Two systems write a handful of tokens **inline on `<html>`**, which beats every
stylesheet including tokens.css. This is intentional theming, not a conflict:

- **Accent picker** (`main.js`) — sets `--primary` / `--accent` / button tokens
  for the user's chosen accent (amber default, plus blue/green/orange/purple/red).
- **Editor Appearance panel** (`features/editor-appearance.js`) — sets the
  editor surface + `--code-*` / `--ed-*` tokens for the chosen editor theme.

If a user has saved a custom accent/editor theme, the app reflects *that*, and
tokens.css supplies the defaults for everything they haven't customised.

---

## 3. Token reference

All tokens are defined in `tokens.css`. Legacy aliases (`--s1`, `--fs-h1`,
`--shadow-1`, `--radius`) are kept so the ~1000 existing `var()` references keep
resolving; new code should prefer the semantic names.

### Surfaces (by elevation)
`--surface-0` (`--bg`) · `--surface-1` (`--panel`) · `--surface-2` (`--panel-2`)
· `--surface-3` (`--panel-3`) · `--bg-soft` · `--border` · `--border-soft`
Interaction: `--surface-hover` · `--surface-active`

### Text
`--text` · `--text-muted` · `--text-dim`

### Accent & semantic
`--primary` / `--primary-strong` / `--primary-soft` · `--accent` (chains to
`--primary`) · `--accent-rgb` · `--on-accent` · `--success` · `--warning` ·
`--error` (`--danger`) · `--muted`
Verdicts: `--ac` · `--wa` · `--tle` · `--mle` · `--re` · `--ce`
AI: `--ai` / `--purple` / `--purple-soft`
Buttons: `--btn-primary[-h]` · `--btn-run[-h]` · `--btn-judge[-h]` · `--btn-del[-h]`

### Typography
Families: `--sans` (Geist) · `--mono` (JetBrains Mono)
Scale: `--text-display` 28 · `--text-h-xl` 20 · `--text-h-l` 16 · `--text-h-m` 14
· `--text-body` 13.5 · `--text-caption` 12 · `--text-badge` 11 · `--text-code`
Line height: `--lh-tight` · `--lh-body` · `--lh-read`

### Spacing (4-based)
`--space-4` · `--space-8` · `--space-12` · `--space-16` · `--space-20` ·
`--space-24` · `--space-32`

### Radius
`--radius-sm` 6 · `--radius-md` 8 (`--radius`) · `--radius-lg` 12

### Elevation
`--shadow-sm` · `--shadow-md` · `--shadow-floating` · `--edge-light` (lit-from-above hairline) · `--ring` (gold focus halo)

### Motion
`--ease` (ease-out-quint) · `--dur-fast` 120ms · `--dur-normal` 200ms · `--dur-slow` 320ms

### Editor-only (live in main.css, the editor's private contract)
`--syn-*` (syntax) · `--code-font/-fs/-lh/-weight/-letter-spacing/-fg` ·
`--ed-selection/-cursor/-line-highlight/-active-gutter/-gutter-bg/-gutter-fg` ·
`--syn-bracket-*` · `--indent-guide-color`

---

## 4. Rules for future sprints

1. **No magic numbers** in component CSS — reference a token.
2. New global value? Add it to `tokens.css`, nowhere else.
3. Editor-private values stay in `main.css`.
4. One accent, one focus ring (`--ring`), one mono family, one scrollbar
   treatment (forge.css §10). Don't reintroduce per-page variants.
5. Prefer semantic names (`--surface-1`, `--text-h-l`, `--shadow-md`) over the
   legacy aliases when writing new rules.
