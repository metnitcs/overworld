import { useEffect } from 'react'
import { useGame } from './game/store'
import { TitleScreen } from './ui/TitleScreen'
import { CreateScreen } from './ui/CreateScreen'
import { GameScreen } from './ui/GameScreen'
import { BattleScreen } from './ui/BattleScreen'
import { Modal } from './ui/Modal'

export default function App() {
  const screen = useGame(s => s.screen)
  const modal = useGame(s => s.modal)
  const setModal = useGame(s => s.setModal)

  // ---------- Global keyboard handler ----------
  // Phaser's built-in keyboard input requires canvas focus and can fail in
  // some setups, so we listen at the window level here. Always works.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't intercept when user is typing in chat / name input
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const st = useGame.getState()
      if (st.screen !== 'game' || st.modal !== 'none') return
      let dx = 0, dy = 0
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': dy = -1; break
        case 'ArrowDown':  case 's': case 'S': dy =  1; break
        case 'ArrowLeft':  case 'a': case 'A': dx = -1; break
        case 'ArrowRight': case 'd': case 'D': dx =  1; break
        default: return
      }
      e.preventDefault()
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

  return (
    <div className="w-screen h-screen overflow-hidden flex items-center justify-center">
      <div className="w-full h-full max-w-[1280px] max-h-[860px] relative">
        {screen === 'create' && <CreateScreen />}
        {screen === 'game' && <GameScreen />}
        {screen === 'battle' && <BattleScreen />}
        {modal !== 'none' && <Modal type={modal} onClose={() => setModal('none')} />}
      </div>
    </div>
  )
}
