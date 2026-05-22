import { useState } from 'react'
import { useGame } from '../../game/store'
import type { ItemType, Rarity } from '@asura/shared'

type Tab = 'all' | 'equip' | 'consume' | 'mat'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'all',     label: 'ทั่วไป',    icon: '🎒' },
  { id: 'equip',   label: 'สวมใส่',   icon: '⚔' },
  { id: 'consume', label: 'ใช้งาน',   icon: '🧪' },
  { id: 'mat',     label: 'แร่ธาตุ',  icon: '💎' },
]

const TOTAL_SLOTS = 32

/** Border colour by rarity — small visual cue per ADR 0002 (display-only). */
const RARITY_BORDER: Record<Rarity, string> = {
  common:    'border-kw-border',
  rare:      'border-blue-400',
  epic:      'border-purple-500',
  legendary: 'border-amber-500',
}
const RARITY_LABEL: Record<Rarity, string> = {
  common:    'พื้นฐาน',
  rare:      'หายาก',
  epic:      'ตำนาน',
  legendary: 'เทพ',
}

export function InventoryModal() {
  const game = useGame(s => s.game)
  const items = useGame(s => s.content!.items)   // content gate in App.tsx guarantees non-null
  const equip = useGame(s => s.equip)
  const unequip = useGame(s => s.unequip)
  const useConsume = useGame(s => s.useConsume)
  const [tab, setTab] = useState<Tab>('all')
  const [selected, setSelected] = useState<string | null>(null)

  const allKeys = Object.keys(game.inventory).filter(k => game.inventory[k] > 0)
  let visibleKeys = allKeys
  if (tab === 'equip')   visibleKeys = allKeys.filter(k => ['weapon', 'armor'].includes(items[k]?.type as ItemType))
  if (tab === 'consume') visibleKeys = allKeys.filter(k => items[k]?.type === 'consume')
  if (tab === 'mat')     visibleKeys = allKeys.filter(k => items[k]?.type === 'mat')

  const sel = selected && items[selected] ? selected : null
  const selItem = sel ? items[sel] : null
  const selPlus = sel ? (game.plus[sel + '_w'] || game.plus[sel + '_a'] || 0) : 0
  const equipped = sel && (sel === game.equipWeapon || sel === game.equipArmor)
  const selRarity: Rarity = selItem?.rarity ?? 'common'

  // Slice 31: equipped quick summary at the top of the modal.
  const wItem = game.equipWeapon ? items[game.equipWeapon] : null
  const aItem = game.equipArmor ? items[game.equipArmor] : null
  const wPlus = game.equipWeapon ? (game.plus[game.equipWeapon + '_w'] || 0) : 0
  const aPlus = game.equipArmor ? (game.plus[game.equipArmor + '_a'] || 0) : 0

  return (
    <div className="flex flex-col gap-2">
      {/* Slice 31: Equipped banner — always-visible "what am I wearing" */}
      <div className="grid grid-cols-2 gap-2 px-1">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-2 border-kw-border rounded text-[11px]">
          <span className="text-xl">⚔</span>
          {wItem ? (
            <div className="flex-1 min-w-0">
              <div className="font-bold text-kw-blue-deep truncate">
                {wItem.emoji} {wItem.name}
                {wPlus > 0 && <span className="text-kw-red ml-1">+{wPlus}</span>}
              </div>
              <div className="text-[10px] text-kw-text-dim">
                ATK +{(wItem.atk || 0) + wPlus * 3}
              </div>
            </div>
          ) : (
            <span className="flex-1 italic text-kw-text-dim">ไม่ได้สวมอาวุธ</span>
          )}
          {wItem && (
            <button className="btn btn-sm btn-ghost" onClick={() => unequip(game.equipWeapon!)}>ถอด</button>
          )}
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-2 border-kw-border rounded text-[11px]">
          <span className="text-xl">🛡</span>
          {aItem ? (
            <div className="flex-1 min-w-0">
              <div className="font-bold text-kw-blue-deep truncate">
                {aItem.emoji} {aItem.name}
                {aPlus > 0 && <span className="text-kw-red ml-1">+{aPlus}</span>}
              </div>
              <div className="text-[10px] text-kw-text-dim">
                DEF +{(aItem.def || 0) + aPlus * 2}
              </div>
            </div>
          ) : (
            <span className="flex-1 italic text-kw-text-dim">ไม่ได้สวมเกราะ</span>
          )}
          {aItem && (
            <button className="btn btn-sm btn-ghost" onClick={() => unequip(game.equipArmor!)}>ถอด</button>
          )}
        </div>
      </div>

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
            const it = items[key]
            if (!it) return <div key={i} className="inv-slot empty" />
            const qty = game.inventory[key]
            const isEquipped = key === game.equipWeapon || key === game.equipArmor
            const plus = game.plus[key + '_w'] || game.plus[key + '_a'] || 0
            const rarityBorder = RARITY_BORDER[it.rarity ?? 'common']
            return (
              <div
                key={i}
                className={`inv-slot ${rarityBorder} ${isEquipped ? 'equipped' : ''} ${selected === key ? '!border-kw-orange ring-2 ring-kw-orange/40' : ''}`}
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
                <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${RARITY_BORDER[selRarity]}`}>
                  {RARITY_LABEL[selRarity]}
                </span>
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
