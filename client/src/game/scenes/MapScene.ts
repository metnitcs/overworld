import Phaser from 'phaser'
import { useGame } from '../store'
import { MAPS, RACES, CLASSES } from '@asura/shared'

const TILE = 64

export class MapScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics
  private tileLayer!: Phaser.GameObjects.Container
  private monsterLayer!: Phaser.GameObjects.Container
  private warpLayer!: Phaser.GameObjects.Container
  private playerSprite!: Phaser.GameObjects.Text
  private playerShadow!: Phaser.GameObjects.Ellipse
  private classBadge!: Phaser.GameObjects.Text
  private currentMap = ''
  private lastMonsters: unknown = null  // reference equality check
  private unsubscribe?: () => void
  private currentPx = 0
  private currentPy = 0

  constructor() {
    super({ key: 'MapScene' })
  }

  create() {
    this.gfx = this.add.graphics()
    this.tileLayer = this.add.container(0, 0)
    this.warpLayer = this.add.container(0, 0)
    this.monsterLayer = this.add.container(0, 0)
    this.playerShadow = this.add.ellipse(0, 0, 36, 14, 0x000000, 0.4)
    this.playerSprite = this.add.text(0, 0, '😈', {
      fontSize: '42px',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5)
    this.classBadge = this.add.text(0, 0, '⚔️', {
      fontSize: '22px',
    }).setOrigin(0.5)

    this.renderForState()

    // Subscribe to store changes — only rerender map when needed
    this.unsubscribe = useGame.subscribe((state) => {
      const g = state.game
      if (g.map !== this.currentMap || state.monsters !== this.lastMonsters) {
        this.renderForState()
      } else if (g.px !== this.currentPx || g.py !== this.currentPy) {
        this.movePlayerTo(g.px, g.py)
      }
    })

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.()
    })
    this.events.on(Phaser.Scenes.Events.DESTROY, () => {
      this.unsubscribe?.()
    })
  }

  private renderForState() {
    const state = useGame.getState()
    const g = state.game
    const map = MAPS[g.map]
    if (!map) return
    this.currentMap = g.map
    this.lastMonsters = state.monsters

    // Resize world to current map
    const worldW = map.w * TILE
    const worldH = map.h * TILE
    this.cameras.main.setBounds(0, 0, worldW, worldH)

    // Background
    this.gfx.clear()
    this.gfx.fillStyle(Phaser.Display.Color.HexStringToColor(map.bg).color, 1)
    this.gfx.fillRect(0, 0, worldW, worldH)

    // Path through middle (horizontal)
    if (map.pathColor) {
      const pathColor = Phaser.Display.Color.HexStringToColor(map.pathColor).color
      this.gfx.fillStyle(pathColor, 0.55)
      this.gfx.fillRect(0, Math.floor(map.h / 2) * TILE - 8, worldW, TILE + 16)
    }

    // Subtle checker
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if ((x + y) % 2 === 0) {
          this.gfx.fillStyle(0xffffff, 0.06)
          this.gfx.fillRect(x * TILE, y * TILE, TILE, TILE)
        }
      }
    }

    // Tiles (decorative)
    this.tileLayer.removeAll(true)
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const h = (x * 7 + y * 13 + map.id.length * 3) % 19
        if (h < 5) {
          const isPath = y === Math.floor(map.h / 2)
          if (isPath && h < 2) continue
          const tile = map.tiles[h % map.tiles.length]
          const t = this.add.text(
            x * TILE + TILE / 2,
            y * TILE + TILE / 2,
            tile,
            { fontSize: '28px' },
          ).setOrigin(0.5).setAlpha(0.85)
          this.tileLayer.add(t)
        }
      }
    }

    // Warps
    this.warpLayer.removeAll(true)
    for (const w of map.warps) {
      const wx = w.x * TILE + TILE / 2
      const wy = w.y * TILE + TILE / 2
      const ring = this.add.circle(wx, wy, 24, 0x9b5bd6, 0.55)
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
      const icon = this.add.text(wx, wy, '🌀', { fontSize: '28px' }).setOrigin(0.5)
      if (w.label) {
        const labelBg = this.add.rectangle(wx, wy - 36, 110, 18, 0x1e4f8a, 0.85)
          .setStrokeStyle(1, 0xffffff, 0.9)
        const label = this.add.text(wx, wy - 36, w.label, {
          fontSize: '11px',
          color: '#ffffff',
          fontFamily: 'Kanit, Tahoma, sans-serif',
        }).setOrigin(0.5)
        this.warpLayer.add([labelBg, label])
      }
      this.warpLayer.add([ring, icon])
    }

    // Monsters
    this.monsterLayer.removeAll(true)
    for (const m of state.monsters) {
      const mx = m.x * TILE + TILE / 2
      const my = m.y * TILE + TILE / 2
      const def = map.monsters[m.monsterIdx]
      if (!def) continue
      const shadow = this.add.ellipse(mx, my + 22, 32, 10, 0x000000, 0.35)
      const text = this.add.text(mx, my, def.emoji, { fontSize: '40px' }).setOrigin(0.5)
      this.tweens.add({
        targets: text,
        y: my - 4,
        duration: 800 + Math.random() * 400,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      })
      const lvBg = this.add.rectangle(mx, my - 28, 36, 14, 0xffd93d, 1)
        .setStrokeStyle(1, 0x6a4500, 1)
      const lv = this.add.text(mx, my - 28, `Lv ${def.lv}`, {
        fontSize: '10px',
        color: '#6a4500',
        fontFamily: 'Kanit, Tahoma, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5)
      this.monsterLayer.add([shadow, text, lvBg, lv])
    }

    // Player sprite
    const r = RACES.find(x => x.id === g.raceId)!
    const c = CLASSES.find(x => x.id === g.classId)!
    this.playerSprite.setText(r.emoji)
    this.classBadge.setText(c.emoji)
    this.movePlayerTo(g.px, g.py, true)
    this.cameras.main.centerOn(g.px * TILE + TILE / 2, g.py * TILE + TILE / 2)
  }

  private movePlayerTo(x: number, y: number, instant = false) {
    this.currentPx = x
    this.currentPy = y
    const px = x * TILE + TILE / 2
    const py = y * TILE + TILE / 2
    if (instant) {
      this.playerSprite.setPosition(px, py)
      this.playerShadow.setPosition(px, py + 22)
      this.classBadge.setPosition(px + 20, py - 16)
    } else {
      // Kill any in-progress tween on the player sprite
      this.tweens.killTweensOf([this.playerSprite, this.classBadge])
      const fromX = this.playerSprite.x
      const fromY = this.playerSprite.y
      this.tweens.add({
        targets: [this.playerSprite, this.classBadge],
        x: { from: fromX, to: px },
        y: { from: fromY, to: py },
        duration: 140,
        ease: 'Sine.easeOut',
        onUpdate: () => {
          this.playerShadow.setPosition(this.playerSprite.x, this.playerSprite.y + 22)
          this.classBadge.setPosition(this.playerSprite.x + 20, this.playerSprite.y - 16)
        },
      })
    }
    this.cameras.main.pan(px, py, 200, 'Sine.easeOut')
  }
}
