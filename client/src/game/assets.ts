// Kenney pixel-art sprite registry.
//
// Each Kenney atlas is a fixed grid of 16×16 tiles, 12 columns wide.
//   frame = row * 12 + col   (0-based from top-left)
//
// Edit the numbers below if a sprite looks wrong — see
// client/public/assets/kenney/README.md for how to read frame indices.
//
// If the atlas file is missing the game falls back to emoji at the call
// site (MapScene checks `textures.exists(key)` before using a sprite).

export const ASSET_KEYS = {
  TINY_TOWN: 'kenney-tiny-town',
  TINY_DUNGEON: 'kenney-tiny-dungeon',
} as const

export type AtlasKey = (typeof ASSET_KEYS)[keyof typeof ASSET_KEYS]

export interface AtlasFile {
  key: AtlasKey
  path: string
  frameWidth: number
  frameHeight: number
  /** Kenney `_packed` atlases use 1px transparent spacing between cells. */
  spacing: number
  margin: number
}

export const ATLASES: AtlasFile[] = [
  {
    key: ASSET_KEYS.TINY_TOWN,
    path: '/assets/kenney/tiny-town/tilemap_packed.png',
    frameWidth: 16,
    frameHeight: 16,
    spacing: 0,
    margin: 0,
  },
  {
    key: ASSET_KEYS.TINY_DUNGEON,
    path: '/assets/kenney/tiny-dungeon/tilemap_packed.png',
    frameWidth: 16,
    frameHeight: 16,
    spacing: 0,
    margin: 0,
  },
]

/** Tile sprite reference. Atlas + frame index. */
export interface SpriteRef {
  atlas: AtlasKey
  frame: number
}

// ─── BASE GROUND TILES (per map) ──────────────────────────────────────────
// Fills every cell with a ground sprite before decorations. Pick a tile id
// that visually fits the map's mood (grass for village, dirt for forest,
// stone for dungeon-like).
export const MAP_BASE_TILES: Record<string, { ground: SpriteRef; path: SpriteRef }> = {
  village: {
    ground: { atlas: ASSET_KEYS.TINY_TOWN, frame: 0 },   // grass
    path:   { atlas: ASSET_KEYS.TINY_TOWN, frame: 4 },   // dirt path
  },
  sakura: {
    ground: { atlas: ASSET_KEYS.TINY_TOWN, frame: 1 },   // grass variant
    path:   { atlas: ASSET_KEYS.TINY_TOWN, frame: 4 },
  },
  forest: {
    ground: { atlas: ASSET_KEYS.TINY_TOWN, frame: 2 },   // darker grass
    path:   { atlas: ASSET_KEYS.TINY_TOWN, frame: 5 },   // worn path
  },
  volcano: {
    ground: { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 1 }, // stone floor
    path:   { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 2 },
  },
  hell: {
    ground: { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 0 }, // dark stone
    path:   { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 3 },
  },
}

// ─── DECORATION TILE GLYPH MAPPING ────────────────────────────────────────
// Maps the emoji glyph stored in Map.layout[y][x].glyph → atlas sprite.
// If a glyph isn't here, MapScene falls back to rendering the emoji as text.
export const TILE_SPRITES: Record<string, SpriteRef | null> = {
  '🏠': { atlas: ASSET_KEYS.TINY_TOWN,    frame: 48 },  // small house
  '🌳': { atlas: ASSET_KEYS.TINY_TOWN,    frame: 60 },  // tree
  '🌲': { atlas: ASSET_KEYS.TINY_TOWN,    frame: 61 },  // pine
  '⛲': { atlas: ASSET_KEYS.TINY_TOWN,    frame: 84 },  // fountain
  '🌷': { atlas: ASSET_KEYS.TINY_TOWN,    frame: 24 },  // flower yellow
  '🌸': { atlas: ASSET_KEYS.TINY_TOWN,    frame: 25 },  // flower pink
  '🌿': { atlas: ASSET_KEYS.TINY_TOWN,    frame: 26 },  // grass tuft
  '🌱': { atlas: ASSET_KEYS.TINY_TOWN,    frame: 27 },  // sprout
  '🍄': { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 87 },  // mushroom
  '🪨': { atlas: ASSET_KEYS.TINY_TOWN,    frame: 6 },   // rock
  '💀': { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 95 },  // skull
  '🌋': null,   // no obvious fit; fallback to emoji
  '🔥': null,
  '🩸': null,
}

// ─── PLAYER SPRITE (per race) ─────────────────────────────────────────────
// Maps race.id (from RACES in shared/data.ts) → character sprite from
// Tiny Dungeon. Pick a frame that visually matches the race personality.
export const RACE_SPRITES: Record<string, SpriteRef> = {
  mara:  { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 122 }, // demon
  angel: { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 108 }, // priestess
  beast: { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 96 },  // ranger
  god:   { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 84 },  // knight
  yaksa: { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 121 }, // ogre
  phaya: { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 109 }, // dark mage
}

// ─── MONSTER SPRITES (per Monster.id from DB) ─────────────────────────────
export const MONSTER_SPRITES: Record<string, SpriteRef> = {
  'larva-small':       { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 124 }, // bug
  'butterfly':         { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 125 },
  'poison-flower':     { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 126 },
  'wolf-shadow':       { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 127 }, // wolf
  'snake-giant':       { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 128 }, // snake
  'mushroom-mystic':   { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 129 },
  'demon-lava':        { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 123 }, // small demon
  'dragon-fire-small': { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 130 }, // dragon
  'ghost-fire':        { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 131 }, // ghost
  'demon-half-moon':   { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 132 }, // bat
  'death-lord':        { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 133 }, // reaper
  'demon-lord':        { atlas: ASSET_KEYS.TINY_DUNGEON, frame: 134 }, // boss demon
}

// ─── NPC SPRITES (per Npc.id from DB) ─────────────────────────────────────
export const NPC_SPRITES: Record<string, SpriteRef> = {
  'village-shopkeeper': { atlas: ASSET_KEYS.TINY_TOWN, frame: 88 }, // merchant
  'village-healer':     { atlas: ASSET_KEYS.TINY_TOWN, frame: 89 }, // priest
}

/** Scale factor to draw 16×16 sprites at the game's 64px tile size.
 *  Phaser will hard-pixel scale up; image-rendering: pixelated on the canvas
 *  keeps it crisp (Phaser does this by default for AUTO/CANVAS renderer). */
export const SPRITE_SCALE = 4
