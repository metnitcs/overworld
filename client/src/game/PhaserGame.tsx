import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { MapScene } from './scenes/MapScene'

interface Props {
  className?: string
}

export function PhaserGame({ className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  useEffect(() => {
    if (!ref.current) return
    // Guard against StrictMode double-mount and leftover canvases
    if (gameRef.current) {
      gameRef.current.destroy(true)
      gameRef.current = null
    }
    ref.current.innerHTML = ''

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ref.current,
      width: 896,
      height: 640,
      backgroundColor: '#a8d8a0',
      transparent: false,
      scene: [MapScene],
      // Disable Phaser's built-in keyboard (we handle keys in App.tsx)
      input: { keyboard: false },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    })

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
      if (ref.current) ref.current.innerHTML = ''
    }
  }, [])

  return <div ref={ref} className={className} />
}
