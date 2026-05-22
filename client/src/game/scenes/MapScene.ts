import Phaser from 'phaser'
import { useGame } from '../store'
import { RACES, CLASSES } from '@asura/shared'
import { resolveAssetUrl } from '../../api/client'
import {
  ATLASES, ASSET_KEYS, MAP_BASE_TILES, TILE_SPRITES,
  RACE_SPRITES, MONSTER_SPRITES, NPC_SPRITES, SPRITE_SCALE,
  type SpriteRef,
} from '../assets'

// ADR 0002: all Map content (layout, monsters, warps) is read from the
// Zustand content cache. The shared MAPS object is no longer consulted.

const TILE = 64

// ─── Sprite size constants ─────────────────────────────────────────────────
// Slice 24: shrunk so the map reads bigger now that the camera fits the whole
// world (no scrolling). Characters are ~35% of TILE — fills enough to spot,
// not so much it dominates the landscape.
const PLAYER_SPRITE_PX = 22
const PLAYER_BADGE_PX  = 12
const MONSTER_SPRITE_PX = 24
const NPC_SPRITE_PX     = 22
const WALL_GLYPH_PX     = 32
const DECOR_GLYPH_PX    = 20

const WANDER_INTERVAL_MS = 2500   // a random monster tries to move every tick
const WANDER_TWEEN_MS    = 280    // smooth-slide duration

/** Visual handle that can be either a Kenney sprite OR an emoji text. The
 *  caller positions and tweens it via the same Phaser game-object API. */
type Visual = Phaser.GameObjects.Image | Phaser.GameObjects.Text

/** Refs the diff-renderer holds per spawned monster so we can tween instead
 *  of rebuilding sprites every time a monster wanders or another is defeated. */
interface MonsterSpriteRefs {
  shadow: Phaser.GameObjects.Ellipse
  visual: Visual  // sprite if Kenney atlas loaded, else text emoji
  lvBg:   Phaser.GameObjects.Rectangle
  lvTxt:  Phaser.GameObjects.Text
  bob:    Phaser.Tweens.Tween
}

export class MapScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics
  private tileLayer!: Phaser.GameObjects.Container
  private groundLayer!: Phaser.GameObjects.Container
  private monsterLayer!: Phaser.GameObjects.Container
  private warpLayer!: Phaser.GameObjects.Container
  private npcLayer!: Phaser.GameObjects.Container
  private playerVisual!: Visual            // sprite-or-text wrapper
  private playerShadow!: Phaser.GameObjects.Ellipse
  private classBadge!: Phaser.GameObjects.Text
  private currentMap = ''
  private unsubscribe?: () => void
  private wanderEvent?: Phaser.Time.TimerEvent
  private currentPx = 0
  private currentPy = 0
  /** Per-spawn-id sprite refs for diff rendering — see renderMonsters(). */
  private monsterSprites = new Map<string, MonsterSpriteRefs>()

  constructor() {
    super({ key: 'MapScene' })
  }

  preload() {
    // Load Kenney atlases. If a file is missing the loader logs and we just
    // fall back to emoji at every call site (see hasAtlas / addSprite).
    for (const a of ATLASES) {
      this.load.spritesheet(a.key, a.path, {
        frameWidth: a.frameWidth,
        frameHeight: a.frameHeight,
        spacing: a.spacing,
        margin: a.margin,
      })
    }
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(
        `[assets] failed to load ${file.src} — sprite will fall back to emoji.`,
        'See client/public/assets/kenney/README.md for download instructions.',
      )
    })
  }

  /** True if the atlas finished loading (file present + parsed). */
  private hasAtlas(key: string): boolean {
    return this.textures.exists(key)
  }

  /** Create a sprite if its atlas is loaded; return null otherwise so the
   *  caller can decide to fall back to a text emoji. Sprites are scaled to
   *  the game's tile pixel size with nearest-neighbour filtering. */
  private addSprite(
    x: number, y: number, ref: SpriteRef | null | undefined,
    scale: number = SPRITE_SCALE,
  ): Phaser.GameObjects.Image | null {
    if (!ref) return null
    if (!this.hasAtlas(ref.atlas)) return null
    const img = this.add.image(x, y, ref.atlas, ref.frame).setOrigin(0.5)
    img.setScale(scale)
    return img
  }

  create() {
    this.gfx = this.add.graphics()
    this.groundLayer = this.add.container(0, 0)
    this.tileLayer = this.add.container(0, 0)
    this.warpLayer = this.add.container(0, 0)
    this.npcLayer = this.add.container(0, 0)
    this.monsterLayer = this.add.container(0, 0)
    this.playerShadow = this.add.ellipse(0, 0, 28, 10, 0x000000, 0.4)
    // Player visual is sprite-or-text. Initial text is a placeholder — race
    // emoji or sprite is set on every renderForState() call.
    this.playerVisual = this.add.text(0, 0, '😈', {
      fontSize: `${PLAYER_SPRITE_PX}px`,
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5)
    this.classBadge = this.add.text(0, 0, '⚔️', {
      fontSize: `${PLAYER_BADGE_PX}px`,
    }).setOrigin(0.5)

    this.renderForState()
    this.renderMonsters()

    // Click-to-Walk (CONTEXT.md). Convert pointer pixel coords → tile
    // coords using the camera scroll offset, then dispatch walkTo. Phaser's
    // pointerdown event fires for both mouse clicks and touch taps, so
    // mobile gets the same input for free.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // p.worldX/Y are in scene coordinates accounting for camera scroll.
      const tx = Math.floor(p.worldX / TILE)
      const ty = Math.floor(p.worldY / TILE)
      useGame.getState().walkTo(tx, ty)
    })

    // Monster wander AI — every WANDER_INTERVAL_MS, pick one random monster
    // and try to step it onto an adjacent walkable + unoccupied tile.
    this.wanderEvent = this.time.addEvent({
      delay: WANDER_INTERVAL_MS,
      loop: true,
      callback: () => this.tickWander(),
    })

    // Subscribe to store changes — distinguish what changed and only
    // re-render the affected layer to keep wander tweens alive.
    this.unsubscribe = useGame.subscribe(() => {
      const state = useGame.getState()
      const g = state.game
      if (g.map !== this.currentMap) {
        // Different map: full rebuild including monster sprites. The rebuild
        // touches every Container in one frame, which would otherwise pop
        // visibly — mask it with a short camera fade-out/in.
        const cam = this.cameras.main
        cam.fadeOut(140, 0, 0, 0)
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.destroyAllMonsterSprites()
          this.renderForState()
          this.renderMonsters()
          cam.fadeIn(180, 0, 0, 0)
        })
      } else {
        if (g.px !== this.currentPx || g.py !== this.currentPy) {
          this.movePlayerTo(g.px, g.py)
        }
        // Always reconcile monsters — cheap if nothing changed (diff-render).
        this.renderMonsters()
      }
    })

    const cleanup = () => {
      this.unsubscribe?.()
      this.wanderEvent?.remove(false)
      this.destroyAllMonsterSprites()
    }
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.on(Phaser.Scenes.Events.DESTROY, cleanup)
  }

  private renderForState() {
    const state = useGame.getState()
    const g = state.game
    const mapInfo = state.content?.maps[g.map]
    if (!mapInfo) return
    this.currentMap = g.map

    // Resize world to current map
    const worldW = mapInfo.w * TILE
    const worldH = mapInfo.h * TILE

    // Slice 24: fit-to-viewport — pick the smaller of width/height ratios so
    // the whole map is always visible, never scrolls. Capped at 1.0 so tiny
    // maps don't zoom in past native pixel size. NO setBounds — that would
    // clamp the camera to world origin and pin small maps to the top-left
    // instead of centering them. The camera is locked here anyway (no pan
    // in movePlayerTo), so unconstrained centerOn is safe.
    const cam = this.cameras.main
    const fitZoom = Math.min(cam.width / worldW, cam.height / worldH, 1)
    cam.setZoom(fitZoom)
    cam.centerOn(worldW / 2, worldH / 2)

    // ───── Background fill (bgImage > sprite carpet > colour fallback) ─────
    this.gfx.clear()
    this.groundLayer.removeAll(true)

    // Slice 21: admin-uploaded bg image. Drawn stretched to world bounds,
    // under everything else. Lazy-loaded the first time we see this image
    // path (Phaser caches by key after the first decode).
    if (mapInfo.bgImage) {
      const key = `bgimg:${mapInfo.bgImage}`
      const draw = () => {
        const img = this.add.image(0, 0, key)
          .setOrigin(0, 0)
          .setDisplaySize(worldW, worldH)
        this.groundLayer.add(img)
      }
      if (this.textures.exists(key)) {
        draw()
      } else {
        // Admin uploads live on the server origin; static /assets/... live on
        // the Vite dev server. resolveAssetUrl handles both transparently.
        const resolved = resolveAssetUrl(mapInfo.bgImage)
        if (resolved) {
          this.load.image(key, resolved)
          this.load.once(Phaser.Loader.Events.COMPLETE, () => {
            if (this.currentMap === g.map) draw()
          })
          this.load.start()
        }
      }
    }

    const baseTiles = MAP_BASE_TILES[g.map]
    const groundLoaded = baseTiles && this.hasAtlas(baseTiles.ground.atlas)
    const pathLoaded   = baseTiles && this.hasAtlas(baseTiles.path.atlas)

    // Skip the sprite-carpet + colour fallback when a bgImage covers the world.
    if (mapInfo.bgImage) {
      // bgImage drawn above — nothing more to do for ground.
    } else if (groundLoaded && pathLoaded) {
      // Sprite-carpet every cell. Path cells (centre horizontal band) get the
      // path tile; everything else gets ground.
      const pathRow = Math.floor(mapInfo.h / 2)
      for (let y = 0; y < mapInfo.h; y++) {
        for (let x = 0; x < mapInfo.w; x++) {
          const ref = y === pathRow ? baseTiles.path : baseTiles.ground
          const t = this.addSprite(x * TILE + TILE / 2, y * TILE + TILE / 2, ref)
          if (t) this.groundLayer.add(t)
        }
      }
    } else {
      // Fallback: solid bg + path stripe drawn with Graphics, as before.
      this.gfx.fillStyle(Phaser.Display.Color.HexStringToColor(mapInfo.bg).color, 1)
      this.gfx.fillRect(0, 0, worldW, worldH)
      if (mapInfo.pathColor) {
        const pathColor = Phaser.Display.Color.HexStringToColor(mapInfo.pathColor).color
        this.gfx.fillStyle(pathColor, 0.55)
        this.gfx.fillRect(0, Math.floor(mapInfo.h / 2) * TILE - 8, worldW, TILE + 16)
      }
      // Dappled shading (only in fallback mode — sprite tiles already vary).
      for (let y = 0; y < mapInfo.h; y++) {
        for (let x = 0; x < mapInfo.w; x++) {
          const h = (x * 17 + y * 31 + this.currentMap.length * 11) % 100
          const alpha = h < 25 ? 0.10 : h < 50 ? 0.04 : 0
          if (alpha > 0) {
            this.gfx.fillStyle(h < 25 ? 0xffffff : 0x000000, alpha)
            this.gfx.fillRect(x * TILE, y * TILE, TILE, TILE)
          }
        }
      }
    }

    // ───── Walls: dark overlay so they read as solid regardless of base ─────
    for (let y = 0; y < mapInfo.h; y++) {
      for (let x = 0; x < mapInfo.w; x++) {
        if (mapInfo.layout[y]?.[x]?.walkable === false) {
          this.gfx.fillStyle(0x000000, 0.32)
          this.gfx.fillRect(x * TILE, y * TILE, TILE, TILE)
        }
      }
    }

    // ───── Decorations: sprite per-cell if mapped, else text emoji ─────
    this.tileLayer.removeAll(true)
    for (let y = 0; y < mapInfo.h; y++) {
      for (let x = 0; x < mapInfo.w; x++) {
        const cell = mapInfo.layout[y][x]
        if (!cell?.glyph) continue
        const isWall = !cell.walkable
        const cx = x * TILE + TILE / 2
        const cy = y * TILE + TILE / 2

        const ref = TILE_SPRITES[cell.glyph]
        const sprite = this.addSprite(cx, cy, ref)
        if (sprite) {
          // Walls stay full-opacity & anchored; decorations get the same
          // jitter we used in emoji mode so adjacent same-tile cells don't
          // look stamped.
          if (!isWall) {
            const seed = (x * 73856093) ^ (y * 19349663) ^ this.currentMap.length * 1031
            const r1 = ((seed & 0xff) / 255) * 2 - 1
            const r2 = (((seed >> 8) & 0xff) / 255) * 2 - 1
            sprite.x += r1 * 4
            sprite.y += r2 * 4
            sprite.setAlpha(0.85)
          }
          this.tileLayer.add(sprite)
        } else {
          // Emoji fallback. Same jitter logic as the old code path.
          const seed = (x * 73856093) ^ (y * 19349663) ^ this.currentMap.length * 1031
          const r1 = ((seed & 0xff) / 255) * 2 - 1
          const r2 = (((seed >> 8) & 0xff) / 255) * 2 - 1
          const r3 = ((seed >> 16) & 0xff) / 255
          const offX = isWall ? 0 : r1 * 6
          const offY = isWall ? 0 : r2 * 6
          const rot  = isWall ? 0 : (r1 + r2) * 7
          const alpha = isWall ? 1 : 0.65 + r3 * 0.3
          const t = this.add.text(
            cx + offX, cy + offY,
            cell.glyph,
            { fontSize: `${isWall ? WALL_GLYPH_PX : DECOR_GLYPH_PX}px` },
          ).setOrigin(0.5).setAlpha(alpha).setAngle(rot)
          this.tileLayer.add(t)
        }
      }
    }

    // Warps — sourced from the Content cache (slice 12).
    this.warpLayer.removeAll(true)
    for (const w of mapInfo.warps) {
      const wx = w.x * TILE + TILE / 2
      const wy = w.y * TILE + TILE / 2
      const ring = this.add.circle(wx, wy, 22, 0x9b5bd6, 0.55)
        .setStrokeStyle(3, 0xffd93d, 1)
      this.tweens.add({
        targets: ring,
        scale: { from: 0.9, to: 1.12 },
        alpha: { from: 0.55, to: 0.85 },
        duration: 800,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      })
      const icon = this.add.text(wx, wy, '🌀', { fontSize: '24px' }).setOrigin(0.5)
      if (w.label) {
        const labelBg = this.add.rectangle(wx, wy - 32, 110, 18, 0x1e4f8a, 0.85)
          .setStrokeStyle(1, 0xffffff, 0.9)
        const label = this.add.text(wx, wy - 32, w.label, {
          fontSize: '11px',
          color: '#ffffff',
          fontFamily: 'Kanit, Tahoma, sans-serif',
        }).setOrigin(0.5)
        this.warpLayer.add([labelBg, label])
      }
      this.warpLayer.add([ring, icon])
    }

    // ───── NPCs (shopkeeper / healer / future quest givers) ─────
    this.npcLayer.removeAll(true)
    for (const npc of mapInfo.npcs) {
      const nx = npc.x * TILE + TILE / 2
      const ny = npc.y * TILE + TILE / 2
      const shadow = this.add.ellipse(nx, ny + 18, 24, 8, 0x000000, 0.35)

      // Sprite if Kenney atlas loaded + mapping exists, else emoji text.
      const spriteRef = NPC_SPRITES[npc.id]
      const visual: Visual =
        this.addSprite(nx, ny, spriteRef) ??
        this.add.text(nx, ny, npc.emoji ?? '🧍', {
          fontSize: `${NPC_SPRITE_PX}px`,
        }).setOrigin(0.5)

      const labelBg = this.add.rectangle(nx, ny - 26, 110, 16, 0x2a1d3e, 0.85)
        .setStrokeStyle(1, 0xffffff, 0.6)
      const label = this.add.text(nx, ny - 26, npc.name, {
        fontSize: '10px',
        color: '#ffe9b8',
        fontFamily: 'Kanit, Tahoma, sans-serif',
      }).setOrigin(0.5)
      this.npcLayer.add([shadow, visual, labelBg, label])
    }

    // ───── Player visual (race sprite if available, else race emoji) ─────
    const r = RACES.find(x => x.id === g.raceId)!
    const c = CLASSES.find(x => x.id === g.classId)!
    this.swapPlayerVisual(g.raceId, r.emoji)
    this.classBadge.setText(c.emoji)
    this.movePlayerTo(g.px, g.py, true)
    // Slice 24: camera already set to fit-zoom + centered on world middle
    // at the top of renderForState — no per-player recenter needed.
  }

  /** Swap the player visual between sprite and emoji as needed when race
   *  changes (e.g. character switch) or atlas becomes available mid-session. */
  private swapPlayerVisual(raceId: string, raceEmoji: string) {
    const spriteRef = RACE_SPRITES[raceId]
    const wantSprite = !!spriteRef && this.hasAtlas(spriteRef.atlas)
    const isSprite = this.playerVisual instanceof Phaser.GameObjects.Image
    const x = this.playerVisual.x
    const y = this.playerVisual.y
    if (wantSprite && !isSprite) {
      this.playerVisual.destroy()
      this.playerVisual = this.addSprite(x, y, spriteRef!)!
    } else if (!wantSprite && isSprite) {
      this.playerVisual.destroy()
      this.playerVisual = this.add.text(x, y, raceEmoji, {
        fontSize: `${PLAYER_SPRITE_PX}px`,
        fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5)
    } else if (wantSprite && isSprite && spriteRef) {
      ;(this.playerVisual as Phaser.GameObjects.Image).setFrame(spriteRef.frame)
    } else if (!wantSprite && !isSprite) {
      ;(this.playerVisual as Phaser.GameObjects.Text).setText(raceEmoji)
    }
  }

  /** Diff-render monsters: tween moved ones, create new ones, destroy gone ones. */
  private renderMonsters() {
    const state = useGame.getState()
    const monsterDefs = state.content?.monsters ?? {}
    const seen = new Set<string>()

    for (const m of state.monsters) {
      seen.add(m.id)
      const def = monsterDefs[m.monsterId]
      if (!def) continue
      const mx = m.x * TILE + TILE / 2
      const my = m.y * TILE + TILE / 2

      const existing = this.monsterSprites.get(m.id)
      if (existing) {
        // Tween x for the whole stack; y for shadow + label band (visual y is
        // bob-owned and restarted below).
        this.tweens.add({
          targets: [existing.shadow, existing.visual, existing.lvBg, existing.lvTxt],
          x: { from: existing.shadow.x, to: mx },
          duration: WANDER_TWEEN_MS,
          ease: 'Sine.easeInOut',
        })
        this.tweens.add({
          targets: existing.shadow, y: my + 18,
          duration: WANDER_TWEEN_MS, ease: 'Sine.easeInOut',
        })
        this.tweens.add({
          targets: existing.lvBg, y: my - 24,
          duration: WANDER_TWEEN_MS, ease: 'Sine.easeInOut',
        })
        this.tweens.add({
          targets: existing.lvTxt, y: my - 24,
          duration: WANDER_TWEEN_MS, ease: 'Sine.easeInOut',
        })
        existing.bob.stop()
        existing.visual.setY(my)
        existing.bob = this.tweens.add({
          targets: existing.visual,
          y: my - 3,
          duration: 800 + Math.random() * 400,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        })
      } else {
        // Fresh spawn — pick sprite or fall back to emoji text.
        const shadow = this.add.ellipse(mx, my + 18, 26, 8, 0x000000, 0.35)
        const spriteRef = MONSTER_SPRITES[m.monsterId]
        const visual: Visual =
          this.addSprite(mx, my, spriteRef) ??
          this.add.text(mx, my, def.emoji, {
            fontSize: `${MONSTER_SPRITE_PX}px`,
          }).setOrigin(0.5)
        const bob = this.tweens.add({
          targets: visual,
          y: my - 3,
          duration: 800 + Math.random() * 400,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        })
        const lvBg = this.add.rectangle(mx, my - 24, 36, 14, 0xffd93d, 1)
          .setStrokeStyle(1, 0x6a4500, 1)
        const lvTxt = this.add.text(mx, my - 24, `Lv ${def.lv}`, {
          fontSize: '10px',
          color: '#6a4500',
          fontFamily: 'Kanit, Tahoma, sans-serif',
          fontStyle: 'bold',
        }).setOrigin(0.5)
        this.monsterLayer.add([shadow, visual, lvBg, lvTxt])
        this.monsterSprites.set(m.id, { shadow, visual, lvBg, lvTxt, bob })
      }
    }

    // Remove sprites whose spawn was defeated or wiped on map change.
    for (const [id, refs] of this.monsterSprites) {
      if (seen.has(id)) continue
      refs.bob.stop()
      refs.shadow.destroy()
      refs.visual.destroy()
      refs.lvBg.destroy()
      refs.lvTxt.destroy()
      this.monsterSprites.delete(id)
    }
  }

  private destroyAllMonsterSprites() {
    for (const refs of this.monsterSprites.values()) {
      refs.bob.stop()
      refs.shadow.destroy()
      refs.visual.destroy()
      refs.lvBg.destroy()
      refs.lvTxt.destroy()
    }
    this.monsterSprites.clear()
  }

  /** Move one random monster onto an adjacent walkable + unoccupied tile.
   *  No-op if no eligible move exists, or if the player isn't in the game
   *  screen (the timer keeps ticking but battle/modal pauses interaction). */
  private tickWander() {
    const state = useGame.getState()
    if (state.screen !== 'game' || state.modal !== 'none') return
    const monsters = state.monsters
    if (monsters.length === 0) return
    const mapInfo = state.content?.maps[state.game.map]
    if (!mapInfo) return

    const idx = Math.floor(Math.random() * monsters.length)
    const m = monsters[idx]
    const dirs: Array<[number, number]> = [[0, 1], [0, -1], [1, 0], [-1, 0]]
    // Shuffle in place for unbiased direction choice.
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[dirs[i], dirs[j]] = [dirs[j], dirs[i]]
    }

    for (const [dx, dy] of dirs) {
      const nx = m.x + dx
      const ny = m.y + dy
      if (nx < 0 || nx >= mapInfo.w || ny < 0 || ny >= mapInfo.h) continue
      if (!mapInfo.layout[ny]?.[nx]?.walkable) continue
      if (nx === state.game.px && ny === state.game.py) continue
      if (monsters.some((o, oi) => oi !== idx && o.x === nx && o.y === ny)) continue
      if (mapInfo.warps.some((w) => w.x === nx && w.y === ny)) continue
      if (mapInfo.npcs.some((n) => n.x === nx && n.y === ny)) continue
      useGame.getState().moveMonster(m.id, nx, ny)
      return
    }
  }

  private movePlayerTo(x: number, y: number, instant = false) {
    this.currentPx = x
    this.currentPy = y
    const px = x * TILE + TILE / 2
    const py = y * TILE + TILE / 2
    if (instant) {
      this.playerVisual.setPosition(px, py)
      this.playerShadow.setPosition(px, py + 18)
      this.classBadge.setPosition(px + 14, py - 12)
    } else {
      // Kill any in-progress tween on the player visual + badge
      this.tweens.killTweensOf([this.playerVisual, this.classBadge])
      const fromX = this.playerVisual.x
      const fromY = this.playerVisual.y
      this.tweens.add({
        targets: [this.playerVisual, this.classBadge],
        x: { from: fromX, to: px },
        y: { from: fromY, to: py },
        // Slice 24: 140→220 ms to match the slower walk cadence.
        duration: 220,
        ease: 'Sine.easeOut',
        onUpdate: () => {
          this.playerShadow.setPosition(this.playerVisual.x, this.playerVisual.y + 18)
          this.classBadge.setPosition(this.playerVisual.x + 14, this.playerVisual.y - 12)
        },
      })
    }
    // Slice 24: camera is locked at fit-to-world zoom + center — no follow.
  }
}
