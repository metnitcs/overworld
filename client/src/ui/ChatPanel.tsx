import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../game/store'

type Tab = 'chat' | 'log'

/** Slice 24: split the bottom-right pane into two tabs:
 *   - 💬 chat — player-to-player conversation (messages with no `kind` / 'normal')
 *   - 📜 log  — system events (battle results, drops, level ups; kind in {system, good, bad})
 *
 *  Both feed from the same store.chat queue; we filter by kind on render so
 *  the existing log() / pushChat() call sites don't have to change. */
export function ChatPanel() {
  const chat = useGame(s => s.chat)
  const pushChat = useGame(s => s.pushChat)
  const playerName = useGame(s => s.game.name)
  const [tab, setTab] = useState<Tab>('chat')
  const [text, setText] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Partition by kind on every render — cheap (chat is capped at 50).
  const { chatMsgs, logMsgs } = useMemo(() => {
    const chatMsgs = chat.filter((m) => !m.kind || m.kind === 'normal')
    const logMsgs  = chat.filter((m) => m.kind && m.kind !== 'normal')
    return { chatMsgs, logMsgs }
  }, [chat])

  const shown = tab === 'chat' ? chatMsgs : logMsgs
  const otherCount = tab === 'chat' ? logMsgs.length : chatMsgs.length

  // Auto-scroll on new message OR tab change so the latest entry is visible.
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [shown.length, tab])

  function send() {
    const t = text.trim()
    if (!t) return
    const d = new Date()
    pushChat({
      avatar: '🧙',
      speaker: playerName,
      text: t,
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      // No kind → falls in chat tab
    })
    setText('')
  }

  return (
    <>
      {/* Tab strip */}
      <div className="flex border-b border-kw-border bg-white/40 px-1.5 pt-1 gap-1 text-[11px]">
        <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')}
          label="💬 แชท" count={chatMsgs.length}
          hint={tab === 'chat' ? null : (otherCount > 0 ? '•' : null)} />
        <TabBtn active={tab === 'log'} onClick={() => setTab('log')}
          label="📜 ระบบ" count={logMsgs.length}
          hint={tab === 'log' ? null : (otherCount > 0 ? '•' : null)} />
      </div>

      {/* Message list */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto py-1 pr-1">
        {shown.length === 0 ? (
          <div className="text-center text-[11px] text-kw-text-dim py-4">
            {tab === 'chat' ? 'ยังไม่มีข้อความ — พิมพ์อะไรซักหน่อย' : 'ยังไม่มี log จากระบบ'}
          </div>
        ) : (
          shown.map(m => (
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
          ))
        )}
      </div>

      {/* Input — only on chat tab; log tab has no compose */}
      {tab === 'chat' ? (
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
      ) : (
        <div className="px-2 py-1.5 border-t border-kw-border bg-white/40 text-[10px] text-kw-text-dim">
          ระบบบันทึก {logMsgs.length} รายการ — ไม่สามารถพิมพ์ในแถบนี้
        </div>
      )}
    </>
  )
}

function TabBtn({ active, onClick, label, count, hint }: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  hint: string | null
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-2.5 py-1 rounded-t font-semibold transition-colors ${
        active
          ? 'bg-white text-kw-blue-deep border-x border-t border-kw-border -mb-px'
          : 'text-kw-text-dim hover:bg-white/60'
      }`}
    >
      {label}
      <span className={`ml-1 text-[9px] ${active ? 'text-kw-text-dim' : 'text-kw-text-dim'}`}>
        ({count})
      </span>
      {hint && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-kw-red rounded-full" />
      )}
    </button>
  )
}
