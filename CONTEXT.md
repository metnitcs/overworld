# อสูรเว็บ Online

A web MMORPG (React + Phaser) inspired by classic 2000s-era Thai web games. This glossary pins the language used across the product so UI, store, and (Phase 2+) server code stay consistent.

## Language

**Portal**:
The public-facing front page of the game — a single content-rich page (hero, news, leaderboards, online players, events, web board) that a visitor lands on and from which they enter character creation. It is the first screen of the app.
_Avoid_: Title screen, splash, landing page, home — all refer to this same Portal.

**Character Creation**:
The flow where a visitor picks race and class to create a playable character. The Portal's primary call-to-action ("เริ่มเล่นเกม") leads here.
_Avoid_: Create screen, signup.

**Screen**:
A top-level app view selected by the store's routing state — currently `title` (→ becomes the Portal), `create`, `game`, `battle`. One screen is visible at a time.

**Pre-game**:
Everything a visitor sees before they are controlling a character in the world: the Portal and Character Creation. The point of crossing into in-game is entering the playable world.

**In-game**:
Everything reachable while controlling a character: the GameScreen HUD, BattleScreen, every modal opened from the HUD (inventory, craft, enhance, class-change, shop, help), and the chat panel. The pre-game / in-game line is also the visual-style boundary of the product.

## Example dialogue

> **Dev:** When the player clicks "เริ่มเล่นเกม" on the Portal, where do they go?
> **Designer:** Into Character Creation. The Portal is just the front door — news, ranking, who's online. The moment they want to play, they leave the Portal and never see it again that session.
> **Dev:** So the Portal isn't the in-game HUD?
> **Designer:** Right. The Portal is the website around the game. The HUD is inside the game.
