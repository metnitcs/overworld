# Dual design system, split by pre-game / in-game line

The product carries two complete UI styles instead of one. The **Mochi** system (clean modern web — off-white `#f6f5f7` bg, white cards with subtle shadows, Inter + Sarabun, pink accent used sparingly) covers all **pre-game** surfaces: the Portal (front page) and Character Creation. The existing **kawaii pastel** system (`kw-*` tokens, chunky pop-shadow buttons, Kanit) covers every **in-game** surface: the GameScreen HUD, BattleScreen, all six modals (opened from the HUD), and the chat panel.

Mochi tokens are declared as CSS custom properties on a `.mochi` root class applied to Portal and Character Creation wrappers. Mochi component classes (`.topbar`, `.hero`, `.kpi`, `.card`, `.news-row`, `.btn-primary`, `.day-card`, …) live in `@layer components` of `client/src/index.css`, all scoped under `.mochi` so they cannot collide with the kawaii `.btn` / `.card` / etc. used elsewhere. The Portal additionally breaks out of the app shell's fixed 1280×860 clipped frame to render as a full-width scrolling page; the fixed frame still applies to `create` / `game` / `battle`.

## Considered Options

- **Migrate everything to Mochi.** Rejected — a clean web-dashboard look fights the RPG HUD and the turn-based combat scene, and because every modal opens *over* the in-game HUD, dual-styled modals would create the exact aesthetic conflict the migration was meant to avoid.
- **Portal-only restyle, leave Character Creation kawaii.** Rejected — the user asked for `ทุกจุดยึด style แบบนี้ด้วย`, and Character Creation is reached directly from the Portal CTA, so the visual transition would jar one click in.
- **Single Mochi stylesheet imported only by Mochi screens.** Rejected for now — `@layer components` scoped under `.mochi` follows the existing codebase pattern (see `.btn`, `.panel`, `.option-card` already in `index.css`) and avoids introducing a new file convention.

## Consequences

- A future reader will see two opposite aesthetics and may be tempted to "unify" them. They should not. The split is the design.
- Any new screen must explicitly pick a side: pre-game → wrap in `.mochi`, in-game → use kawaii classes. Borderline cases (e.g., a future Settings screen) are decided by which world they sit inside.
- HelpModal stays kawaii because it is in-game. If we later want a Mochi-styled Help inside the Portal, build it as a separate Portal section, not a dual-styled modal.
