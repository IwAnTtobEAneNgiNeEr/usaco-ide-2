# Roadmap

Directional, not a promise. Priorities follow the project's values: **ease of use → visual
quality → competitive-programming workflow → reliability → maintainability.** Issues and PRs
can reshuffle this freely.

## Near-term

- **Screenshots + demo GIF** in the README (the biggest first-impression win).
- **English UI mode** — a language toggle so the (currently Vietnamese) UI is approachable
  internationally. The docs already lead in English.
- **Friendlier compiler onboarding** — detect common MinGW/MSYS install paths automatically.
- **Visualizer** — more input shapes (weighted/directed graph labels, interval sets).

## Medium-term

- **Editorial for contests** — surface the AI editorial inside the AI Contest workspace
  (it's intentionally hidden on user-imported problems, where real editorials are better).
- **Skill map ↔ Dashboard** — finish consolidating the skill constellation into the Dashboard
  so there's a single "where am I?" view.
- **Import/export** — one-click export of a problem (or the whole workspace) as a zip; richer
  importers beyond the legacy tracker format.
- **Per-problem time/memory limits** surfaced more prominently.

## Longer-term / exploratory

- **Real MLE enforcement** via OS job objects (needs a native module — must not break the
  zero-dependency rule; would be opt-in).
- **More providers** in the AI key auto-detect.
- **Optional packaged desktop builds** (the Electron wrapper exists; packaging is currently
  experimental).

## Explicit non-goals

- A cloud backend, accounts, or telemetry.
- A frontend build step / framework migration.
- Becoming a heavyweight general IDE — it should stay a focused CP judge + coach.

See [CHANGELOG.md](CHANGELOG.md) for what's already shipped.
