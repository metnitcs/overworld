import { useEffect, useRef, useState } from 'react'
import { useGame } from '../game/store'

export function ChatPanel() {
  const chat = useGame(s => s.chat)
  const pushChat = useGame(s => s.pushChat)
  const [text, setText] = useState('')
  const playerName = useGame(s => s.game.name)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [chat])

  function send() {
    const t = text.trim()
    if (!t) return
    const d = new Date()
    pushChat({
      avatar: '🧙',
      speaker: playerName,
      text: t,
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    })
    setText('')
  }

  return (
    <>
      <div ref={scrollerRef} className="flex-1 overflow-y-auto py-1 pr-1">
        {chat.map(m => (
          <div key={m.id} className="chat-row">
            <div className="chat-avatar">{m.avatar}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="text-[10px] font-bold text-kw-blue-deep">{m.speaker}</span>
                <span className="chat-time">{m.time}</span>
              </div>
              <div className={`chat-bubble ${m.kind || ''}`}>{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1 p-1.5 border-t border-kw-border bg-white/40">
        <input
          className="flex-1 px-2 py-1 text-xs bg-white border border-kw-border rounded focus:outline-none focus:border-kw-orange"
          placeholder="พิมพ์ข้อความ..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button className="btn btn-sm" onClick={send}>ส่ง</button>
      </div>
    </>
  )
}
