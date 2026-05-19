import { useState } from 'react'
import { useGame } from '../../game/store'
import { ITEMS, type ItemType } from '@asura/shared'

type Tab = 'all' | 'equip' | 'consume' | 'mat'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'all',     label: 'ทั่วไป',    icon: '🎒' },
  { id: 'equip',   label: 'สวมใส่',   icon: '⚔' },
  { id: 'consume', label: 'ใช้งาน',   icon: '🧪' },
  { id: 'mat',     label: 'แร่ธาตุ',  icon: '💎' },
]

const TOTAL_SLOTS = 32

export function InventoryModal() {
  const game = useGame(s => s.game)
  const equip = useGame(s => s.equip)
  const unequip = useGame(s => s.unequip)
  const useConsume = useGame(s => s.useConsume)
  const [tab, setTab] = useState<Tab>('all')
  const [selected, setSelected] = useState<string | null>(null)

  const allKeys = Object.keys(game.inventory).filter(k => game.inventory[k] > 0)
  let visibleKeys = allKeys
  if (tab === 'equip')   visibleKeys = allKeys.filter(k => ['weapon', 'armor'].includes(ITEMS[k]?.type))
  if (tab === 'consume') visibleKeys = allKeys.filter(k => ITEMS[k]?.type === 'consume')
  if (tab === 'mat')     visibleKeys = allKeys.filter(k => ITEMS[k]?.type === 'mat')

  const sel = selected && ITEMS[selected] ? selected : null
  const selItem = sel ? ITEMS[sel] : null
  const selPlus = sel ? (game.plus[sel + '_w'] || game.plus[sel + '_a'] || 0) : 0
  const equipped = sel && (sel === game.equipWeapon || sel === game.equipArmor)

  return (
    <div className="flex flex-col gap-2">
      {/* Tabs */}
      <div className="flex gap-1 border-b-2 border-kw-orange">
        {TABS.map(t => (
          <div
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </div>
        ))}
      </div>

      {/* Slot grid */}
      <div className="bg-white border-2 border-kw-border rounded p-2">
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: Math.max(TOTAL_SLOTS, visibleKeys.length) }).map((_, i) => {
            const key = visibleKeys[i]
            if (!key) return <div key={i} className="inv-slot empty" />
            const it = ITEMS[key]
            if (!it) return <div key={i} className="inv-slot empty" />
            const qty = game.inventory[key]
            const isEquipped = key === game.equipWeapon || key === game.equipArmor
            const plus = game.plus[key + '_w'] || game.plus[key + '_a'] || 0
            return (
              <div
                key={i}
                className={`inv-slot ${isEquipped ? 'equipped' : ''} ${selected === key ? '!border-kw-orange ring-2 ring-kw-orange/40' : ''}`}
                onClick={() => setSelected(key)}
              >
                {it.emoji}
                {qty > 1 && <span className="qty">{qty}</span>}
                {plus > 0 && <span className="plus">+{plus}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="panel panel-pad min-h-[80px]">
        {selItem ? (
          <div className="flex gap-3 items-start">
            <div className="text-4xl">{selItem.emoji}</div>
            <div className="flex-1">
              <div className="font-bold text-kw-blue-deep">
                {selItem.name}
                {selPlus > 0 && <span className="text-kw-red ml-1">+{selPlus}</span>}
                {equipped && <span className="text-green-600 text-xs ml-2">(สวมอยู่)</span>}
              </div>
              <div className="text-xs text-kw-text-dim mt-0.5">{selItem.desc}</div>
              <div className="text-xs text-kw-blue-deep mt-1 font-semibold">
                {selItem.atk && `ATK +${selItem.atk}${selPlus > 0 ? ` (+${selPlus * 3} จากบวก)` : ''} `}
                {selItem.def && `DEF +${selItem.def}${selPlus > 0 ? ` (+${selPlus * 2} จากบวก)` : ''} `}
                {selItem.heal && `ฟื้น ${selItem.heal} HP `}
                {selItem.healMp && `ฟื้น ${selItem.healMp} MP `}
              </div>
              <div className="text-xs mt-1 text-kw-text-dim">มี {game.inventory[sel!]} ชิ้น</div>
            </div>
            <div className="flex flex-col gap-1">
              {selItem.type === 'consume' && (
                <button className="btn btn-sm btn-green" onClick={() => useConsume(sel!)}>
                  ใช้
                </button>
              )}
              {(selItem.type === 'weapon' || selItem.type === 'armor') && !equipped && (
                <button className="btn btn-sm" onClick={() => equip(sel!)}>สวม</button>
              )}
              {(selItem.type === 'weapon' || selItem.type === 'armor') && equipped && (
                <button className="btn btn-sm btn-ghost" onClick={() => unequip(sel!)}>ถอด</button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center text-kw-text-dim text-xs py-2">
            คลิกที่ไอเท็มเพื่อดูรายละเอียด
          </div>
        )}
      </div>

      <div className="flex justify-between text-xs text-kw-text-dim px-1">
        <span>จำนวนไอเท็ม {visibleKeys.length} ชิ้น</span>
        <span>จำนวนเงิน <span className="text-kw-orange font-bold">{game.gold.toLocaleString()}</span> พีซ</span>
      </div>
    </div>
  )
}
