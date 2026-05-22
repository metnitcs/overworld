import { useEffect, useRef, useState } from 'react'
import type { Screen } from '@asura/shared'
import { useGame, flushSave } from './game/store'
import { ApiError } from './api/client'
import { AuthScreen } from './ui/AuthScreen'
import { TitleScreen } from './ui/TitleScreen'
import { CharacterSelectScreen } from './ui/CharacterSelectScreen'
import { CreateScreen } from './ui/CreateScreen'
import { GameScreen } from './ui/GameScreen'
import { BattleScreen } from './ui/BattleScreen'
import { AdminScreen } from './ui/AdminScreen'
import { Modal } from './ui/Modal'
import { api } from './api/client'

export default function App() {
  const screen = useGame(s => s.screen)
  const modal = useGame(s => s.modal)
  const setModal = useGame(s => s.setModal)
  const content = useGame(s => s.content)
  const loadContent = useGame(s => s.loadContent)
  const [contentErr, setContentErr] = useState<string | null>(null)

  // Content gate (ADR 0002): every UI surface assumes the Content cache is
  // loaded. Fetch once on boot; show a splash while pending and a retry on
  // failure so the user never lands on a half-broken modal.
  useEffect(() => {
    if (content) return
    let cancelled = false
    loadContent()
      .then(() => { if (!cancelled) setContentErr(null) })
      .catch((e: unknown) => {
        if (cancelled) return
        setContentErr(e instanceof Error ? e.message : 'load failed')
      })
    return () => { cancelled = true }
  }, [content, loadContent])

  // ---------- Global keyboard handler ----------
  // Phaser's built-in keyboard input requires canvas focus and can fail in
  // some setups, so we listen at the window level here. Always works.
  //
  // Direction is read from `e.code` (physical key position), NOT `e.key`,
  // so WASD keeps working when the OS keyboard layout is Thai / Cyrillic /
  // etc. — those layouts produce different characters for the same key
  // (Thai 'ไ' for W, 'ห' for K…). Arrow keys are layout-independent in
  // both APIs so either works for them.
  useEffect(() => {
    // Per-step cooldown for hold-to-walk. Matches the Click-to-Walk step
    // delay (240 ms) so keyboard hold-walk and mouse-path-walk feel identical.
    // Without it, OS keyboard auto-repeat fires ~30 Hz and the player teleports
    // ahead of the visual tween. Slice 24: bumped 160→240 ms after feedback
    // that walking felt too fast.
    const STEP_COOLDOWN_MS = 240
    let lastStepAt = 0
    function onKey(e: KeyboardEvent) {
      // Don't intercept when user is typing in chat / name input
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const st = useGame.getState()
      if (st.screen !== 'game' || st.modal !== 'none') return
      let dx = 0, dy = 0
      switch (e.code) {
        case 'ArrowUp':    case 'KeyW': dy = -1; break
        case 'ArrowDown':  case 'KeyS': dy =  1; break
        case 'ArrowLeft':  case 'KeyA': dx = -1; break
        case 'ArrowRight': case 'KeyD': dx =  1; break
        default: return
      }
      e.preventDefault()
      const now = performance.now()
      if (now - lastStepAt < STEP_COOLDOWN_MS) return
      lastStepAt = now
      // Keyboard input always cancels any in-flight Click-to-Walk Path so the
      // player can wrestle control back without waiting for the path to finish.
      st.cancelPath()
      st.tryMove(dx, dy)
    }
    function onModalKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const st = useGame.getState()
        if (st.modal !== 'none') st.setModal('none')
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onModalKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onModalKey)
    }
  }, [])

  // Resume an authenticated session after a reload.
  //   401  → logout (token expired)
  //   0 chars → create screen
  //   1+ → restore the persisted screen (admin/game/character-select)
  // Slice 34: runs ONCE per mount via resumedRef so the persisted screen
  // (which arrives via zustand partialize) can be a non-auth value
  // without skipping setup.
  const resumedRef = useRef(false)
  useEffect(() => {
    if (!content) return
    if (resumedRef.current) return
    const st = useGame.getState()
    if (!st.token) return
    resumedRef.current = true
    // Capture the user's last screen BEFORE listCharacters / selectCharacter
    // can mutate it.
    const lastScreen: Screen = st.screen
    api.me(st.token)
      .then((meRes) => {
        useGame.setState({ role: meRes.user.role })
        return st.listCharacters()
      })
      .then(async () => {
        const fresh = useGame.getState()
        const count = fresh.characters.length
        if (count === 0) {
          useGame.setState({ screen: 'create', hasSave: false })
          return
        }
        const lastId = fresh.activeCharacterId
        const lastChar = lastId ? fresh.characters.find((c) => c.id === lastId) : undefined

        // Slice 34: try to restore the EXACT screen the user was on.
        //   - admin    → only if role=ADMIN
        //   - game     → only if last character still exists
        //   - char-sel → always falls through
        if (lastScreen === 'admin' && fresh.role === 'ADMIN') {
          useGame.setState({ screen: 'admin', hasSave: true })
          return
        }
        // For 'game' or any other unknown screen → auto-resume the game.
        // We deliberately don't try to restore battle/create/title screens.
        const resumeToGame = !lastScreen || lastScreen === 'game' || lastScreen === 'auth'
        if (resumeToGame && lastChar) {
          try {
            await fresh.selectCharacter(lastChar.id)
            return  // selectCharacter set screen to 'game'
          } catch {
            // Fall through to character-select on any error
          }
        }
        useGame.setState({ screen: 'character-select', hasSave: true })
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          st.logout()
        } else {
          st.logout()
        }
      })
  }, [content])

  // Autosave lifecycle: flush pending PUT /api/character when the tab is
  // hidden or the user is about to leave. `keepalive: true` inside flushSave
  // means the request survives unload.
  // NOTE: visibilitychange is dispatched on `document`, not `window`.
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === 'hidden') flushSave()
    }
    function onPageHide() { flushSave() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', flushSave)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', flushSave)
    }
  }, [])

  if (!content) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center gap-3 bg-kw-cream">
        {contentErr ? (
          <>
            <div className="text-kw-red font-semibold">โหลด Content ไม่สำเร็จ</div>
            <div className="text-xs text-kw-text-dim max-w-sm text-center">{contentErr}</div>
            <button
              className="btn"
              onClick={() => { setContentErr(null); void loadContent().catch((e: unknown) => setContentErr(e instanceof Error ? e.message : 'load failed')) }}
            >
              ลองใหม่
            </button>
          </>
        ) : (
          <div className="text-kw-blue-deep">กำลังโหลดข้อมูลเกม…</div>
        )}
      </div>
    )
  }

  if (screen === 'auth') {
    return <AuthScreen />
  }

  // Portal is a full-page scrolling web layout; every other screen lives in
  // the fixed 1280×860 game frame. See docs/adr/0001-dual-design-system-pre-game-vs-in-game.md
  if (screen === 'title') {
    return (
      <>
        <TitleScreen />
        {modal !== 'none' && <Modal type={modal} onClose={() => setModal('none')} />}
      </>
    )
  }

  // Slice 22: AdminScreen is a back-of-house dashboard, NOT the game canvas —
  // it gets the full viewport rather than the fixed 1280×860 frame, so wide
  // monitors stop wasting space on the sides.
  if (screen === 'admin') {
    return <AdminScreen />
  }

  return (
    <div className="w-screen h-screen overflow-hidden flex items-center justify-center">
      <div className="w-full h-full max-w-[1280px] max-h-[860px] relative">
        {screen === 'character-select' && <CharacterSelectScreen />}
        {screen === 'create' && <CreateScreen />}
        {screen === 'game' && <GameScreen />}
        {screen === 'battle' && <BattleScreen />}
        {modal !== 'none' && <Modal type={modal} onClose={() => setModal('none')} />}
      </div>
    </div>
  )
}
